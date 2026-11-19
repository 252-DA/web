export type BankRole = "VIEW" | "USE" | "EDIT";
export type BankVisibility = "PRIVATE" | "COURSE" | "SUBJECT";
export type BankRelation = "mine" | "course" | "shared" | "subject" | "admin";
export type QuestionOrigin = "AI_GENERATED" | "MANUAL" | "CANVAS_IMPORT" | "FORK";

export type BankShareRow = {
  bank_id: string;
  grantee_type: "USER" | "COURSE";
  grantee_id: string;
  grantee_label?: string;
  role: BankRole;
  created_at?: string;
};

export type QuestionBankSummary = {
  bank_id: string;
  title: string;
  description: string | null;
  visibility: BankVisibility;
  is_course_default: boolean;
  subject_code: string | null;
  home_course: {
    course_id: string;
    name: string;
    subject_code: string;
  };
  owner: { user_id: string; display_name: string } | null;
  role: BankRole;
  can_change_visibility?: boolean;
  relation: BankRelation;
  is_current_course: boolean;
  counts: {
    total: number;
    usable: number;
    retired: number;
    by_status: Record<string, number>;
  };
  shares?: BankShareRow[];
};

export type QuestionBankDetail = {
  bank_id: string;
  title: string;
  description: string | null;
  visibility: BankVisibility;
  is_course_default: boolean;
  subject_code: string | null;
  home_course_id: string;
  home_course_name: string | null;
  can_change_visibility: boolean;
  role: BankRole;
  shares?: BankShareRow[];
};

export type BankShareCandidates = {
  subject_code: string | null;
  courses: Array<{ course_id: string; name: string }>;
  users: Array<{ user_id: string; display_name: string; courses: string[] }>;
};

export type BankQuizItem = {
  quiz_id: string;
  bank_id: string;
  course_id: string;
  lo_id: string | null;
  type: string;
  question: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  bloom_level: number | null;
  status: string;
  origin: QuestionOrigin;
  provenance: Record<string, unknown> | null;
  current_version_id: string | null;
  forked_from_version_id: string | null;
  created_at: string;
  updated_at: string;
  learning_outcomes: { lo_id: string; code: string; statement_vi: string } | null;
  current_version: { version_id: string; version_no: number } | null;
  author: { display_name: string } | null;
  lms_links?: Array<{
    direction: string;
    lms_type: string;
    ext_bank_title: string | null;
    ext_question_id: string;
    version_id: string | null;
    synced_at: string;
    stale: boolean;
  }>;
};

export type QuizItemVersion = {
  version_id: string;
  quiz_id: string;
  version_no: number;
  type: string;
  question: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  lo_id: string | null;
  bloom_level: number | null;
  provenance: Record<string, unknown> | null;
  created_at: string;
  creator: { display_name: string } | null;
};

export type QuizItemVersionsResponse = {
  quiz_id: string;
  current_version_id: string | null;
  forked_from_version_id: string | null;
  versions: QuizItemVersion[];
};

export const VISIBILITY_LABELS: Record<BankVisibility, string> = {
  PRIVATE: "Riêng tư (chỉ người được chia sẻ)",
  COURSE: "Trong khoá học",
  SUBJECT: "Cùng môn học (USE)",
};

export const ROLE_LABELS: Record<BankRole, string> = {
  VIEW: "Xem (VIEW)",
  USE: "Dùng vào đề & Fork (USE)",
  EDIT: "Chỉnh sửa & Chia sẻ (EDIT)",
};

export const ORIGIN_LABELS: Record<string, string> = {
  AI_GENERATED: "Sinh bằng AI",
  MANUAL: "Giảng viên viết",
  CANVAS_IMPORT: "Nhập từ Canvas",
  FORK: "Nhân bản (Fork)",
};

export const ITEM_STATUS_LABELS: Record<string, string> = {
  GENERATED_DRAFT: "Bản nháp AI",
  REVIEWING: "Đang review",
  CHANGES_REQUESTED: "Cần chỉnh sửa",
  APPROVED: "Đã duyệt",
  PUBLISHED: "Đã publish",
  RETIRED: "Đã ngừng dùng",
};

/** Nhãn nguồn gốc kèm model AI (nếu có trong provenance). */
export function formatOriginAndModel(origin?: string | null, provenance?: unknown): string {
  const base = (origin && ORIGIN_LABELS[origin]) || "Sinh bằng AI";
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return base;
  }
  const p = provenance as Record<string, unknown>;
  const model =
    (typeof p.writer_model === "string" && p.writer_model) ||
    (typeof p.model_id === "string" && p.model_id) ||
    null;
  return model ? `${base} (${model})` : base;
}

/** Nhãn nút xuất. Tên tạm theo kế hoạch P4, đổi ở đây nếu chốt tên khác. */
export const CANVAS_EXPORT_LABEL = "Xuất sang Canvas";

export type QuestionBankSyncStatus = "QUEUED" | "RUNNING" | "WAITING_LMS" | "COMPLETED" | "FAILED";

export type QuestionBankExportCounts = {
  exported?: number;
  updated?: number;
  unsupported?: number;
  failed?: number;
  retired_on_canvas?: number;
  canvas_issues?: number;
};

/** Một lần xuất/nhập Canvas (bảng question_bank_sync_jobs của core-api). */
export type QuestionBankSyncJob = {
  job_id: string;
  bank_id: string;
  direction: "EXPORT" | "IMPORT";
  status: QuestionBankSyncStatus;
  counts: QuestionBankExportCounts;
  report: Array<{ quiz_id?: string; reason: string }>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export function isSyncJobActive(job: QuestionBankSyncJob | null): boolean {
  return Boolean(job && ["QUEUED", "RUNNING", "WAITING_LMS"].includes(job.status));
}

/** Một dòng tóm tắt lần xuất cho giảng viên. */
export function describeExportJob(job: QuestionBankSyncJob): string {
  switch (job.status) {
    case "QUEUED":
      return "Đang chờ xuất sang Canvas…";
    case "RUNNING":
      return "Đang đóng gói câu hỏi…";
    case "WAITING_LMS":
      return "Canvas đang nhập gói câu hỏi…";
    case "FAILED":
      return `Xuất sang Canvas thất bại: ${job.last_error ?? "lỗi không rõ"}`;
    case "COMPLETED": {
      const c = job.counts ?? {};
      const parts = [
        `${c.exported ?? 0} câu mới`,
        `${c.updated ?? 0} câu cập nhật`,
        c.unsupported ? `${c.unsupported} câu không xuất được` : null,
        c.failed ? `${c.failed} câu không thấy bên Canvas sau khi nhập` : null,
        c.retired_on_canvas ? `${c.retired_on_canvas} câu đã ngừng dùng vẫn còn bên Canvas` : null,
      ].filter(Boolean);
      return `Đã xuất sang Canvas: ${parts.join(", ")}.`;
    }
  }
}
