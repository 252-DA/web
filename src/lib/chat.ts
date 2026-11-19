/** Ba chế độ truy xuất của chatbot (docs/chatbot-ba-che-do-ke-hoach.md). */
export const CHAT_MODES = ["vector", "tools", "graph"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export const CHAT_MODE_INFO: Record<ChatMode, { letter: string; title: string; detail: string }> = {
  vector: {
    letter: "A",
    title: "Vector",
    detail: "Một lần tìm vector trên tài liệu khóa học, rồi trả lời. RAG thuần, làm đối chứng.",
  },
  tools: {
    letter: "B",
    title: "Công cụ",
    detail:
      "Mô hình tự gọi công cụ nhiều bước: tìm vector, tra theo trang, tra đề cương (chương/LO), kéo đoạn láng giềng.",
  },
  graph: {
    letter: "C",
    title: "Đồ thị quan hệ",
    detail:
      "Như chế độ công cụ, thêm công cụ tra quan hệ giữa các ý (nguyên nhân, thành phần, đối lập, tiên quyết…) đã kiểm bằng trích dẫn nguyên văn.",
  },
};

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODES as readonly string[]).includes(value);
}

export type ChatCitation = {
  index: number;
  chunk_id: string;
  document_id: string;
  heading_path: string[];
  page_number: number | null;
  quote?: string | null;
  /** BFF gắn thêm từ core-api để giao diện ghi rõ nguồn là tài liệu nào. */
  document_name?: string | null;
  mime_type?: string | null;
  /** "outline" là đề cương môn học (không thuộc file nào); thiếu nghĩa là đoạn tài liệu. */
  kind?: "chunk" | "outline";
};

/** Gợi ý mở đầu và phạm vi tài liệu cho màn hình chat trống. */
export type ChatContext = {
  course: { code: string; name: string } | null;
  documents: { document_id: string; title: string }[];
  suggestions: string[];
};

export type ChatToolCall = {
  tool: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  found?: number | null;
  ms?: number;
  error?: string | null;
};

export type TutorReply = {
  answer: string;
  model: string;
  citations: ChatCitation[];
  trace: {
    mode: ChatMode;
    steps: number;
    llm_calls: number;
    retrieved: number;
    tool_calls: ChatToolCall[];
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    forced_answer: boolean;
  };
};
