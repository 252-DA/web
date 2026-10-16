import { answerKey, quizChoices } from "./quiz";

/**
 * Năm kiểu câu hỏi và dạng `options` / `correct_answer` — khớp core-api
 * `src/quiz/question-types.ts`, nơi kiểm tra cuối cùng mọi lần ghi.
 *
 *   MCQ_SINGLE    options: 4 chuỗi        correct_answer: chuỗi
 *   MCQ_MULTI     options: 4–6 chuỗi      correct_answer: mảng phương án đúng
 *   TRUE_FALSE    options: ["Đúng","Sai"] correct_answer: "Đúng" | "Sai"
 *   FILL_BLANK    options: null           correct_answer: mảng cách viết chấp nhận
 *   SHORT_ANSWER  options: null           correct_answer: { model_answer, rubric[] }
 */
export const QUESTION_TYPES = [
  { value: "MCQ_SINGLE", label: "Trắc nghiệm 1 đáp án", short: "1 đáp án" },
  { value: "MCQ_MULTI", label: "Nhiều đáp án đúng", short: "Nhiều đáp án" },
  { value: "TRUE_FALSE", label: "Đúng / Sai", short: "Đúng/Sai" },
  { value: "FILL_BLANK", label: "Điền khuyết", short: "Điền khuyết" },
  { value: "SHORT_ANSWER", label: "Tự luận ngắn (AI chấm)", short: "Tự luận" },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]["value"];

export const TRUE_FALSE_OPTIONS = ["Đúng", "Sai"];
export const MAX_MULTI_OPTIONS = 6;
/** Giới hạn ô nhập phía người học; worker còn cắt ở 3000 ký tự trước khi chấm. */
export const MAX_SHORT_ANSWER_CHARS = 2000;

export function isQuestionType(value: unknown): value is QuestionType {
  return QUESTION_TYPES.some((t) => t.value === value);
}

export function questionTypeLabel(type: string | null | undefined, short = false): string {
  const found = QUESTION_TYPES.find((t) => t.value === type);
  if (!found) return type || "Trắc nghiệm";
  return short ? found.short : found.label;
}

/** Câu chọn phương án (radio/checkbox). Kiểu lạ của dữ liệu cũ coi như trắc nghiệm. */
export function hasChoices(type: string | null | undefined): boolean {
  return type !== "FILL_BLANK" && type !== "SHORT_ANSWER";
}

/** Khoá (`answerKey`) của các phương án đúng, để tô màu. */
export function correctKeys(type: string | null | undefined, correct: unknown): Set<string> {
  const values = type === "MCQ_MULTI" && Array.isArray(correct) ? correct : [correct];
  return new Set(values.map(answerKey));
}

export function acceptedAnswers(correct: unknown): string[] {
  const values = Array.isArray(correct) ? correct : [correct];
  return values.filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
}

export type EssayKey = { model_answer: string; rubric: string[] };

export function essayKey(correct: unknown): EssayKey {
  const value = (correct && typeof correct === "object" ? correct : {}) as Record<string, unknown>;
  return {
    model_answer: typeof value.model_answer === "string" ? value.model_answer : "",
    rubric: Array.isArray(value.rubric) ? value.rubric.filter((r): r is string => typeof r === "string") : [],
  };
}

/** Người học đã trả lời câu này chưa (ô trống, chưa tick gì thì chưa). */
export function isAnswered(type: string | null | undefined, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (type === "MCQ_MULTI") return Array.isArray(value) && value.length > 0;
  if (type === "FILL_BLANK" || type === "SHORT_ANSWER") return typeof value === "string" && Boolean(value.trim());
  return true;
}

/** Đáp án lưu trong DB có khớp dạng của kiểu câu không — chặn duyệt câu hỏng. */
export function hasValidAnswer(quiz: { type?: string | null; options: unknown; correct_answer: unknown }): boolean {
  const correct = quiz.correct_answer;
  switch (quiz.type) {
    case "MCQ_MULTI": {
      const options = new Set(quizChoices(quiz.options).map((c) => answerKey(c.value)));
      return Array.isArray(correct) && correct.length > 0 && correct.every((c) => options.has(answerKey(c)));
    }
    case "FILL_BLANK":
      return acceptedAnswers(correct).length > 0;
    case "SHORT_ANSWER": {
      const key = essayKey(correct);
      return Boolean(key.model_answer.trim()) && key.rubric.length > 0;
    }
    default:
      return quizChoices(quiz.options).some((c) => answerKey(c.value) === answerKey(correct));
  }
}

export type QuizEdit = {
  question: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string;
};

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const lines = (form: FormData, name: string) =>
  field(form, name)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Đọc form sửa câu (`QuestionEditFields`) thành dữ liệu ghi `quiz_items`.
 * Không kiểm tra ở đây: core-api kiểm tra theo kiểu thật của câu và trả lỗi rõ.
 */
export function editFromForm(type: string | null | undefined, form: FormData): QuizEdit {
  const base = { question: field(form, "question"), explanation: field(form, "explanation") };
  switch (type) {
    case "MCQ_MULTI": {
      const rows = Array.from({ length: MAX_MULTI_OPTIONS }, (_, i) => ({
        text: field(form, `option_${i}`),
        correct: form.get(`correct_${i}`) === "on",
      })).filter((row) => row.text);
      return { ...base, options: rows.map((r) => r.text), correct_answer: rows.filter((r) => r.correct).map((r) => r.text) };
    }
    case "TRUE_FALSE":
      return { ...base, options: TRUE_FALSE_OPTIONS, correct_answer: field(form, "correct_answer") };
    case "FILL_BLANK":
      return { ...base, options: null, correct_answer: lines(form, "accepted") };
    case "SHORT_ANSWER":
      return {
        ...base,
        options: null,
        correct_answer: { model_answer: field(form, "model_answer"), rubric: lines(form, "rubric") },
      };
    default: {
      const options = [0, 1, 2, 3].map((i) => field(form, `option_${i}`));
      // Hai form cũ đặt tên khác nhau cho ô đáp án đúng.
      const index = Number(form.get("correctIndex") ?? form.get("correct_index"));
      return { ...base, options, correct_answer: options[index] ?? "" };
    }
  }
}
