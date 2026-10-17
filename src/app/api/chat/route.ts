import { NextRequest, NextResponse } from "next/server";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { isChatMode, type ChatMode, type TutorReply } from "@/lib/chat";
import { readSessionFromRequest } from "@/lib/route-session";
import { askTutor, TutorError } from "@/lib/tutor";

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 6;

type Settings = { mode: string };
type History = { role: "user" | "assistant"; content: string }[];

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

/**
 * Một lượt hỏi đáp. Chế độ truy xuất do admin chọn ở /manage/chat và đọc ở core-api,
 * không do trình duyệt gửi lên, để người dùng không tự đổi chế độ của cuộc so sánh.
 * Lượt nào cũng ghi vào chat_runs (kể cả lượt lỗi) làm số liệu cho báo cáo.
 */
export async function POST(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  const { session } = active;
  if (!session.chatbotEnabled) {
    return NextResponse.json({ error: "Chatbot chưa được bật cho khóa học này." }, { status: 403 });
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
  const documentId = typeof payload.documentId === "string" && payload.documentId ? payload.documentId : undefined;
  const pageNumber =
    typeof payload.pageNumber === "number" && Number.isInteger(payload.pageNumber) && payload.pageNumber > 0
      ? payload.pageNumber
      : undefined;

  const claims = claimsFromSession(session);
  let mode: ChatMode = "vector";
  try {
    const settings = await coreApi.getChatSettings<Settings>(claims);
    if (isChatMode(settings.mode)) mode = settings.mode;
  } catch {
    // Không đọc được cài đặt thì dùng chế độ mặc định thay vì chặn người học.
  }

  const started = Date.now();
  let reply: TutorReply | null = null;
  let failure: TutorError | null = null;
  try {
    reply = await askTutor({
      course_id: session.courseId,
      message,
      mode,
      history: readHistory(payload.history),
      document_id: documentId,
      page_number: pageNumber,
    });
  } catch (error) {
    failure = error instanceof TutorError ? error : new TutorError(502, "Chatbot gặp lỗi.");
  }

  let runId: string | null = null;
  try {
    const run = await coreApi.recordChatRun<{ run_id: string }>(
      {
        courseId: session.courseId,
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
  } catch {
    // Ghi số liệu hỏng không được làm hỏng câu trả lời.
  }

  if (failure || !reply) {
    return NextResponse.json({ error: failure?.message ?? "Chatbot gặp lỗi.", runId }, { status: failure?.status ?? 502 });
  }
  const isStaff = session.role === "administrator" || session.courseRole === "instructor" || session.courseRole === "ta";
  return NextResponse.json(
    {
      answer: reply.answer,
      citations: reply.citations,
      runId,
      // Chế độ và vết công cụ chỉ cho giảng viên/admin: sinh viên không cần thấy cách chatbot tìm.
      ...(isStaff ? { mode, trace: reply.trace } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
