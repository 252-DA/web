// Kiểu dữ liệu cho mô hình người học theo LO (learning agent giai đoạn 1,
// core-api/src/learning-agent). Khớp với LearnerModelService.summary và
// LearnerModelService.courseMastery — đổi bên đó thì sửa bên này.

export type LoStatus = "insufficient_evidence" | "practicing" | "mastered";

export type ModelInfo = {
  policy: string;
  prior: number;
  threshold: number;
  minObservations: number;
};

export type LoPending = { grading: number; review: number; not_revealed: number };

export type LoMasteryState = {
  loId: string;
  mastery: number;
  observations: number;
  correct: number;
  consecutiveWrong: number;
  status: LoStatus;
  firstMasteredAt: string | null;
  lastObservedAt: string | null;
  pending: LoPending;
  repeats: number;
};

export type LoInfo = {
  loId: string;
  code: string;
  parentCode: string | null;
  statement: string;
  bloomLevel: number | null;
};

export type LearnerSummaryLo = LoInfo & LoMasteryState;

export type LearnerSummary = {
  courseId: string;
  userId: string;
  model: ModelInfo;
  los: LearnerSummaryLo[];
};

export type CourseMasteryLo = LoInfo & {
  bank: { practice: number; byType: Record<string, number>; inExam: number; low: boolean };
  mastered: number;
};

export type CourseMasteryStudent = {
  userId: string;
  name: string | null;
  los: LoMasteryState[];
};

export type CourseMastery = {
  courseId: string;
  model: ModelInfo;
  minPracticeItems: number;
  los: CourseMasteryLo[];
  students: CourseMasteryStudent[];
};

export const STATUS_META: Record<LoStatus, { label: string; short: string; badge: string; bar: string }> = {
  mastered: {
    label: "Đã thành thạo",
    short: "Đạt",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    bar: "bg-emerald-500",
  },
  practicing: {
    label: "Đang luyện",
    short: "Luyện",
    badge: "bg-amber-100 text-amber-800 ring-amber-200",
    bar: "bg-amber-500",
  },
  insufficient_evidence: {
    label: "Chưa đủ dữ liệu",
    short: "Chưa đủ",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    bar: "bg-slate-300",
  },
};

export const BLOOM_LEVELS: Record<number, string> = {
  1: "Nhớ",
  2: "Hiểu",
  3: "Vận dụng",
  4: "Phân tích",
  5: "Đánh giá",
  6: "Sáng tạo",
};

export function bloomLabel(level: number | null): string | null {
  if (level == null) return null;
  const name = BLOOM_LEVELS[level];
  return name ? `${name} (B${level})` : `B${level}`;
}

/** Màu ô heatmap theo mức nắm 0–1 và ngưỡng đạt của mô hình. */
export function masteryCellClass(state: LoMasteryState | undefined, threshold: number): string {
  if (!state || state.observations === 0) return "bg-slate-100 text-slate-400";
  if (state.status === "mastered") return "bg-emerald-500 text-white";
  if (state.mastery >= threshold) return "bg-teal-200 text-teal-900";
  if (state.mastery >= threshold * 0.65) return "bg-amber-300 text-amber-950";
  return "bg-rose-300 text-rose-950";
}

export function pendingTotal(pending: LoPending): number {
  return pending.grading + pending.review + pending.not_revealed;
}

export function pendingLabel(pending: LoPending): string | null {
  const parts: string[] = [];
  if (pending.grading > 0) parts.push(`${pending.grading} đang chấm`);
  if (pending.review > 0) parts.push(`${pending.review} chờ duyệt`);
  if (pending.not_revealed > 0) parts.push(`${pending.not_revealed} chưa công bố đáp án`);
  return parts.length ? parts.join(" · ") : null;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
