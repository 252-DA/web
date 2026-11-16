import type { ChatCitation, ChatMode, TutorReply } from "./chat";

const TUTOR_URL = (process.env.TUTOR_URL || "http://ai-tutor:8010").replace(/\/$/, "");
// Chế độ công cụ gọi mô hình vài lần mỗi câu hỏi nên chậm hơn một lần gọi.
const TUTOR_TIMEOUT_MS = Number(process.env.TUTOR_TIMEOUT_MS || 120_000);

export class TutorError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type TutorRequestBody = {
  course_id: string;
  message: string;
  mode: ChatMode;
  history?: { role: "user" | "assistant"; content: string }[];
  document_id?: string;
  page_number?: number;
};

export type TutorStreamEvent =
  | { event: "step"; phase: "searching" | "answering"; tool?: string }
  | { event: "evidence"; citations: ChatCitation[] }
  | { event: "delta"; text: string }
  | { event: "reset" }
  | { event: "done"; response: TutorReply }
  | { event: "error"; detail?: string };

export async function askTutor(body: TutorRequestBody): Promise<TutorReply> {
  let response: Response;
  try {
    response = await fetch(`${TUTOR_URL}/v1/tutor/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TUTOR_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new TutorError(504, timedOut ? "Trợ giảng AI trả lời quá lâu." : "Không kết nối được trợ giảng AI.");
  }
  if (!response.ok) {
    throw new TutorError(response.status === 422 ? 400 : 502, "Trợ giảng AI chưa trả lời được.");
  }
  return (await response.json()) as TutorReply;
}

export async function streamTutor(
  body: TutorRequestBody,
  onEvent?: (event: TutorStreamEvent) => void,
): Promise<TutorReply> {
  let response: Response;
  try {
    response = await fetch(`${TUTOR_URL}/v1/tutor/messages/stream`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TUTOR_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new TutorError(504, timedOut ? "Trợ giảng AI trả lời quá lâu." : "Không kết nối được trợ giảng AI.");
  }
  if (!response.ok || !response.body) {
    throw new TutorError(response.status === 422 ? 400 : 502, "Trợ giảng AI chưa trả lời được.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalReply: TutorReply | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        let parsed: TutorStreamEvent;
        try {
          parsed = JSON.parse(dataLine.slice(5).trim()) as TutorStreamEvent;
        } catch {
          continue;
        }
        if (parsed.event === "error") {
          throw new TutorError(502, "Trợ giảng AI chưa trả lời được.");
        }
        if (parsed.event === "done") {
          finalReply = parsed.response;
        } else {
          onEvent?.(parsed);
        }
      }
    }
  } catch (error) {
    if (error instanceof TutorError) throw error;
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new TutorError(504, timedOut ? "Trợ giảng AI trả lời quá lâu." : "Không kết nối được trợ giảng AI.");
  } finally {
    reader.releaseLock();
  }

  if (!finalReply) {
    throw new TutorError(502, "Trợ giảng AI chưa trả lời được.");
  }
  return finalReply;
}

