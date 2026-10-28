import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, claimsFromSession, coreApi } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import {
  isChatMode,
  type ChatCitation,
  type ChatMode,
  type ChatToolCall,
  type TutorReply,
} from "@/lib/chat";
import { withDocumentNames } from "@/lib/chat-sources";
import { readSessionFromRequest } from "@/lib/route-session";
import { askTutor, streamTutor, TutorError } from "@/lib/tutor";

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 6;

type Settings = { mode: string };
type History = { role: "user" | "assistant"; content: string }[];

type StoredRun = {
  run_id: string;
  created_at: string;
  mode: string;
  question: string;
  answer: string | null;
  citations: ChatCitation[] | null;
  tool_calls: ChatToolCall[] | null;
  steps: number;
  latency_ms: number | null;
  status: "OK" | "ERROR";
  error: string | null;
  rating: number | null;
};

type ConversationSummary = {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ConversationData = {
  conversation: ConversationSummary | null;
  turns: StoredRun[];
  history: History;
};

function readHistory(value: unknown): History {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        typeof m === "object" &&
        m !== null &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string" &&
        (m as { content: string }).content.trim().length > 0,
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

function isStaffSession(session: { role?: string; courseRole?: string }): boolean {
  return (
    session.role === "administrator" ||
    session.courseRole === "instructor" ||
    session.courseRole === "ta"
  );
}

/**
 * Mặc định trả hội thoại trống và danh sách lịch sử khi mở chat.
 * Chỉ tải nội dung hội thoại cũ khi người học chọn conversationId cụ thể.
 */
export async function GET(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  const { session } = active;
  if (!session.chatbotEnabled) {
    return NextResponse.json({ error: "Trợ giảng AI chưa được bật cho khóa học này." }, { status: 403 });
  }
  if (!session.courseId) {
    return NextResponse.json({ error: "Phiên không gắn với khóa học nào." }, { status: 400 });
  }

  const claims = claimsFromSession(session);
  const rawConvId = request.nextUrl.searchParams.get("conversationId")?.trim() || undefined;
  const isStaff = isStaffSession(session);

  try {
    const [convData, listData] = await Promise.all([
      rawConvId
        ? coreApi.getChatConversation<ConversationData>(
            { courseId: session.courseId, conversationId: rawConvId },
            claims,
          )
        : Promise.resolve(null),
      coreApi.listChatConversations<{ conversations: ConversationSummary[] }>(
        { courseId: session.courseId },
        claims,
      ),
    ]);

    const courseId = session.courseId;
    const turns = await Promise.all((convData?.turns ?? []).map(async (r) => {
      const mode: ChatMode = isChatMode(r.mode) ? r.mode : "vector";
      const toolCalls = Array.isArray(r.tool_calls) ? r.tool_calls : [];
      return {
        runId: r.run_id,
        question: r.question,
        answer: r.status === "OK" ? (r.answer ?? undefined) : undefined,
        citations: await withDocumentNames(Array.isArray(r.citations) ? r.citations : [], courseId, claims),
        error: r.status === "ERROR" ? (r.error || "Trợ giảng AI chưa trả lời được.") : undefined,
        rating: r.rating ?? undefined,
        ...(isStaff
          ? {
              mode,
              trace: {
                mode,
                steps: r.steps ?? 0,
                llm_calls: 0,
                retrieved: 0,
                tool_calls: toolCalls,
                input_tokens: 0,
                output_tokens: 0,
                latency_ms: r.latency_ms ?? 0,
                forced_answer: false,
              },
            }
          : {}),
      };
    }));

    return NextResponse.json(
      {
        conversation: convData?.conversation ?? null,
        turns,
        conversations: listData?.conversations ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CoreApiError) {
      const httpStatus = error.status === 7 ? 403 : error.status === 5 ? 404 : 400;
      return NextResponse.json({ error: String(error.body) }, { status: httpStatus });
    }
    return NextResponse.json({ error: "Không tải được hội thoại." }, { status: 500 });
  }
}

/** Xóa mềm một cuộc trò chuyện của chính người học (giữ nguyên chat_runs cho thống kê). */
export async function DELETE(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  const { session } = active;
  if (!session.courseId) {
    return NextResponse.json({ error: "Phiên không gắn với khóa học nào." }, { status: 400 });
  }

  let conversationId = request.nextUrl.searchParams.get("conversationId")?.trim() || "";
  if (!conversationId) {
    try {
      const body = (await request.json()) as { conversationId?: unknown };
      if (typeof body.conversationId === "string") conversationId = body.conversationId.trim();
    } catch {
      // body trống
    }
  }
  if (!conversationId) {
    return NextResponse.json({ error: "Thiếu conversationId." }, { status: 400 });
  }

  try {
    const result = await coreApi.deleteChatConversation(
      { courseId: session.courseId, conversationId },
      claimsFromSession(session),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoreApiError) {
      const httpStatus = error.status === 7 ? 403 : error.status === 5 ? 404 : 400;
      return NextResponse.json({ error: String(error.body) }, { status: httpStatus });
    }
    return NextResponse.json({ error: "Không xóa được cuộc trò chuyện." }, { status: 400 });
  }
}

/**
 * Một lượt hỏi đáp. Chế độ truy xuất do admin chọn ở /manage/chat và đọc ở core-api,
 * không do trình duyệt gửi lên, để người dùng không tự đổi chế độ của cuộc so sánh.
 * Lượt nào cũng ghi vào chat_runs (kể cả lượt lỗi và cả khi người học đóng ngăn chat giữa chừng).
 */
export async function POST(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  const { session } = active;
  if (!session.chatbotEnabled) {
    return NextResponse.json({ error: "Trợ giảng AI chưa được bật cho khóa học này." }, { status: 403 });
  }
  if (!session.courseId) {
    return NextResponse.json({ error: "Phiên không gắn với khóa học nào." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload không hợp lệ." }, { status: 400 });
  }
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Hãy nhập câu hỏi." }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: `Câu hỏi quá dài (tối đa ${MAX_MESSAGE_CHARS} ký tự).` }, { status: 400 });
  }
  const requestedConversationId =
    typeof payload.conversationId === "string" && payload.conversationId.trim()
      ? payload.conversationId.trim()
      : undefined;
  const documentId = typeof payload.documentId === "string" && payload.documentId ? payload.documentId : undefined;
  const pageNumber =
    typeof payload.pageNumber === "number" && Number.isInteger(payload.pageNumber) && payload.pageNumber > 0
      ? payload.pageNumber
      : undefined;

  const claims = claimsFromSession(session);
  const courseId = session.courseId;
  const isStaff = isStaffSession(session);

  let mode: ChatMode = "vector";
  let history: History = [];

  try {
    const [settingsRes, convRes] = await Promise.all([
      coreApi.getChatSettings<Settings>(claims).catch(() => null),
      requestedConversationId
        ? coreApi.getChatConversation<ConversationData>(
            { courseId, conversationId: requestedConversationId },
            claims,
          )
        : Promise.resolve(null),
    ]);
    if (settingsRes && isChatMode(settingsRes.mode)) {
      mode = settingsRes.mode;
    }
    if (requestedConversationId) {
      history = readHistory(convRes?.history);
    } else {
      history = readHistory(payload.history);
    }
  } catch (error) {
    if (error instanceof CoreApiError) {
      const httpStatus = error.status === 7 ? 403 : error.status === 5 ? 404 : 400;
      return NextResponse.json({ error: String(error.body) }, { status: httpStatus });
    }
    return NextResponse.json({ error: "Không đọc được cuộc trò chuyện." }, { status: 400 });
  }

  const wantsStream =
    request.headers.get("accept")?.includes("text/event-stream") === true || payload.stream === true;

  const tutorBody = {
    course_id: courseId,
    message,
    mode,
    history,
    document_id: documentId,
    page_number: pageNumber,
  };

  if (wantsStream) {
    const encoder = new TextEncoder();
    let clientClosed = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const sendEvent = (event: string, data: unknown) => {
      if (clientClosed || !streamController) return;
      try {
        streamController.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      } catch {
        clientClosed = true;
      }
    };

    const closeStream = () => {
      if (clientClosed || !streamController) return;
      clientClosed = true;
      try {
        streamController.close();
      } catch {
        // đã đóng
      }
    };

    // Chạy độc lập với kết nối trình duyệt: nếu người học đóng ngăn chat giữa chừng,
    // lượt hỏi đáp vẫn chạy hết và ghi vào chat_runs để mở lại là thấy câu trả lời.
    void (async () => {
      const started = Date.now();
      let reply: TutorReply | null = null;
      let failure: TutorError | null = null;
      let runId: string | null = null;
      let conversationId: string | null = requestedConversationId ?? null;

      try {
        reply = await streamTutor(tutorBody, (ev) => {
          if (ev.event === "step") {
            sendEvent("step", {
              phase: ev.phase,
              ...(isStaff && ev.tool ? { tool: ev.tool } : {}),
            });
          } else if (ev.event === "evidence") {
            void withDocumentNames(ev.citations, courseId, claims).then((citations) =>
              sendEvent("evidence", { citations }),
            );
          } else if (ev.event === "delta") {
            sendEvent("delta", { text: ev.text });
          }
        });
      } catch (error) {
        failure = error instanceof TutorError ? error : new TutorError(502, "Trợ giảng AI gặp lỗi.");
      } finally {
        try {
          const run = await coreApi.recordChatRun<{ run_id: string; conversation_id?: string }>(
            {
              courseId,
              conversationId: requestedConversationId,
              mode,
              question: message,
              answer: reply?.answer,
              citations: reply?.citations ?? [],
              toolCalls: reply?.trace.tool_calls ?? [],
              model: reply?.model,
              steps: reply?.trace.steps ?? 0,
              inputTokens: reply?.trace.input_tokens,
              outputTokens: reply?.trace.output_tokens,
              latencyMs: reply?.trace.latency_ms ?? Date.now() - started,
              status: failure ? "ERROR" : "OK",
              error: failure?.message,
            },
            claims,
          );
          runId = run?.run_id ?? null;
          if (run?.conversation_id) conversationId = run.conversation_id;
        } catch {
          // Ghi số liệu hỏng không được làm hỏng câu trả lời.
        }
      }

      if (failure || !reply) {
        sendEvent("error", {
          error: failure?.message ?? "Trợ giảng AI gặp lỗi.",
          runId,
          conversationId,
        });
      } else {
        sendEvent("done", {
          answer: reply.answer,
          citations: await withDocumentNames(reply.citations, courseId, claims),
          runId,
          conversationId,
          ...(isStaff ? { mode, trace: reply.trace } : {}),
        });
      }
      closeStream();
    })();

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
      cancel() {
        clientClosed = true;
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const started = Date.now();
  let reply: TutorReply | null = null;
  let failure: TutorError | null = null;
  try {
    reply = await askTutor(tutorBody);
  } catch (error) {
    failure = error instanceof TutorError ? error : new TutorError(502, "Trợ giảng AI gặp lỗi.");
  }

  let runId: string | null = null;
  let conversationId: string | null = requestedConversationId ?? null;
  try {
    const run = await coreApi.recordChatRun<{ run_id: string; conversation_id?: string }>(
      {
        courseId,
        conversationId: requestedConversationId,
        mode,
        question: message,
        answer: reply?.answer,
        citations: reply?.citations ?? [],
        toolCalls: reply?.trace.tool_calls ?? [],
        model: reply?.model,
        steps: reply?.trace.steps ?? 0,
        inputTokens: reply?.trace.input_tokens,
        outputTokens: reply?.trace.output_tokens,
        latencyMs: reply?.trace.latency_ms ?? Date.now() - started,
        status: failure ? "ERROR" : "OK",
        error: failure?.message,
      },
      claims,
    );
    runId = run?.run_id ?? null;
    if (run?.conversation_id) conversationId = run.conversation_id;
  } catch {
    // Ghi số liệu hỏng không được làm hỏng câu trả lời.
  }

  if (failure || !reply) {
    return NextResponse.json(
      { error: failure?.message ?? "Trợ giảng AI gặp lỗi.", runId, conversationId },
      { status: failure?.status ?? 502 },
    );
  }
  return NextResponse.json(
    {
      answer: reply.answer,
      citations: await withDocumentNames(reply.citations, courseId, claims),
      runId,
      conversationId,
      // Chế độ và vết công cụ chỉ cho giảng viên/admin: sinh viên không cần thấy cách chatbot tìm.
      ...(isStaff ? { mode, trace: reply.trace } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

