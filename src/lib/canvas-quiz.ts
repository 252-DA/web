import type { ContentGenerationRequest, LearningOutcomeOption } from "./quiz";

export type ChapterOption = { chapter_id: string; code: string; title: string };

/** Cài đặt bài quiz trên Canvas (khớp settingsView ở core-api quiz-set-exam.ts). */
export type QuizSetSettings = {
  mode: "practice" | "exam";
  pointsPossible: number;
  maxAttempts: number | null;
  timeLimitMinutes: number | null;
  shuffle: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  dueAt: string | null;
};
export type ReviewQuiz = {
  quiz_id: string;
  question: string;
  type: string;
  status: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  bloom_level: number | null;
  lo_id: string | null;
  source_chunk_ids: string[];
  learning_outcomes?: { code: string } | null;
  created_at?: string | null;
};
/** Đề đã lưu của khóa, dùng lại được từ bất kỳ module nào. */
export type SavedQuizSet = {
  quiz_set_id: string;
  title: string;
  questionCount: number;
  settings: QuizSetSettings;
  chapterCodes: string[];
};

export type CanvasQuizContext = {
  module: { id: string; name: string };
  chapters: ChapterOption[];
  chapter: ChapterOption | null;
  learningOutcomes: LearningOutcomeOption[];
  quizItems: ReviewQuiz[];
  quizSets: SavedQuizSet[];
  documents: Array<{ document_id: string; title: string; status: string }>;
  requests: ContentGenerationRequest[];
  microContents?: Array<{
    id: string;
    title: string;
    status: string;
    videoStatus: string;
    questionCount: number;
  }>;
};

/** Trạng thái điểm của sinh viên so với sổ điểm Canvas (xem core-api quiz-set-results.ts). */
export type GradeSync =
  | "GRADING"
  | "NEEDS_REVIEW"
  | "POSTED"
  | "SENDING"
  | "WAITING_PUBLISH"
  | "FAILED"
  | "NOT_REQUIRED";

export const GRADE_SYNC: Record<GradeSync, { label: string; tone: string }> = {
  GRADING: { label: "AI đang chấm tự luận", tone: "bg-violet-50 text-violet-800" },
  NEEDS_REVIEW: { label: "Chờ giảng viên chấm tự luận", tone: "bg-amber-50 text-amber-900" },
  POSTED: { label: "Đã ghi vào Canvas", tone: "bg-emerald-50 text-emerald-800" },
  SENDING: { label: "Đang gửi về Canvas", tone: "bg-sky-50 text-sky-800" },
  WAITING_PUBLISH: { label: "Chờ publish bài tập", tone: "bg-amber-50 text-amber-900" },
  FAILED: { label: "Gửi điểm lỗi", tone: "bg-red-50 text-red-800" },
  NOT_REQUIRED: { label: "Không có cột điểm", tone: "bg-slate-100 text-slate-700" },
};

export type LearnerQuizResults = {
  view: "learner";
  settings: QuizSetSettings;
  attempts: Array<{ submissionId: string; attemptedAt: string; score: number; sync: GradeSync }>;
  bestScore: number | null;
  sync: GradeSync | null;
  // Chỉ có ở bài kiểm tra.
  window?: "not_open" | "open" | "closed";
  attemptsUsed?: number;
  openSession?: { sessionId: string; expiresAt: string | null } | null;
  revealed?: boolean;
  revealAt?: string | null;
  review?: Array<{
    quiz_id: string;
    type: string;
    question: string;
    options: unknown;
    chosen: unknown;
    correct_answer: unknown;
    is_correct: boolean;
    /** 0–100; tự luận có điểm từng phần. */
    score: number;
    grading_status: string;
    /** Tự luận: nhận xét của AI chấm. */
    feedback: string | null;
    explanation: string | null;
  }> | null;
};

/** Một lượt làm bài kiểm tra: đề theo thứ tự đã xáo, không kèm đáp án. */
export type ExamSession = {
  sessionId: string;
  startedAt: string;
  expiresAt: string | null;
  serverNow: string;
  attemptNumber: number;
  maxAttempts: number | null;
  items: Array<{ quiz_id: string; question: string; type: string; options: unknown }>;
};

export type StaffQuizResults = {
  view: "staff";
  title: string;
  settings: QuizSetSettings;
  items: Array<{
    quiz_id: string;
    type: string;
    question: string;
    options: unknown;
    correct_answer: unknown;
    explanation: string | null;
    bloom_level: number | null;
    lo_code: string | null;
    answered: number;
    correct: number;
    averageScore: number | null;
  }>;
  byLo: Array<{ lo_id: string; code: string; statement: string; questions: number; correctRate: number | null }>;
  students: Array<{
    userId: string;
    name: string;
    attempts: number;
    bestScore: number;
    latestScore: number;
    lastAttemptedAt: string;
    sync: GradeSync;
  }>;
  summary: {
    students: number;
    submissions: number;
    averageBest: number | null;
    waitingForPublish: number;
    failed: number;
    /** Lượt nộp có tự luận AI không chấm được, chờ giảng viên ở trang Review. */
    needsReview: number;
  };
};

/** Câu tự luận chờ giảng viên chấm tay (core-api EssayGradingService.list). */
export type EssayForReview = {
  attemptId: string;
  submissionId: string | null;
  attemptedAt: string | null;
  student: string;
  assignment: string | null;
  answer: unknown;
  /** Đề lúc người học nộp; null với bài nộp không lưu đề (chỉ chấm tay được). */
  gradingInput: { type: string; question: string; correct_answer: unknown } | null;
};

/** Dữ liệu trang Soạn đề (core-api QuizSetService.builderContext). */
export type QuizBuilderContext = {
  chapters: Array<{
    chapter_id: string;
    code: string;
    title: string;
    learningOutcomes: Array<{ lo_id: string; code: string; statement_vi: string; bloom_level: number | null }>;
  }>;
  documents: Array<{
    document_id: string;
    title: string;
    role: string;
    chapter_code: string | null;
    status: string;
    ready: boolean;
  }>;
  quizItems: ReviewQuiz[];
  quizSets: SavedQuizSet[];
};
