import type { ChatMode, TutorReply } from "./chat";

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
    throw new TutorError(504, timedOut ? "Chatbot trả lời quá lâu." : "Không kết nối được chatbot.");
  }
  if (!response.ok) {
    throw new TutorError(response.status === 422 ? 400 : 502, "Chatbot không trả lời được.");
  }
  return (await response.json()) as TutorReply;
}
