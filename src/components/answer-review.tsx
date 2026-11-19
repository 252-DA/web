import { answerKey, quizChoices } from "@/lib/quiz";
import { acceptedAnswers, correctKeys, essayKey, hasChoices } from "@/lib/question-types";

type Props = {
  type: string;
  options: unknown;
  correctAnswer: unknown;
  /** Bỏ qua (undefined) khi không có bài làm: xem câu hỏi ở trang duyệt/báo cáo. */
  chosen?: unknown;
  /** Tự luận: điểm 0–100 và nhận xét của AI chấm. */
  score?: number | null;
  feedback?: string | null;
  gradingStatus?: string | null;
  /** Lưới 2 cột gọn cho danh sách duyệt câu và báo cáo giảng viên. */
  compact?: boolean;
};

const box = "rounded-xl border p-3 text-sm";

/** Đáp án đúng (và bài làm nếu có) của một câu, theo kiểu câu. */
export function AnswerReview({ type, options, correctAnswer, chosen, score, feedback, gradingStatus, compact }: Props) {
  const withAnswer = chosen !== undefined;

  if (hasChoices(type)) {
    const correct = correctKeys(type, correctAnswer);
    const picked = new Set(
      withAnswer ? (Array.isArray(chosen) ? chosen : chosen === null ? [] : [chosen]).map(answerKey) : [],
    );
    return (
      <div className={compact ? "grid gap-1.5 sm:grid-cols-2" : "grid gap-2"}>
        {quizChoices(options).map((c, i) => {
          const key = answerKey(c.value);
          const isCorrect = correct.has(key);
          const isPicked = picked.has(key);
          if (compact)
            return (
              <p
                key={`${c.key}-${i}`}
                className={`rounded-lg border px-3 py-1.5 text-sm ${isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700"}`}
              >
                <strong>{String.fromCharCode(65 + i)}.</strong> {c.label}
                {isCorrect && <span className="ml-1 text-xs">✓</span>}
              </p>
            );
          const tone = isCorrect
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : isPicked
              ? "border-red-300 bg-red-50 text-red-950"
              : "border-slate-200 bg-white text-slate-600";
          return (
            <div key={`${c.key}-${i}`} className={`flex items-center gap-3 ${box} ${tone}`}>
              <span className="font-semibold">{String.fromCharCode(65 + i)}</span>
              <span className="flex-1">{c.label}</span>
              {isCorrect && isPicked && <span className="text-xs font-semibold">Bạn chọn · Đúng</span>}
              {isCorrect && !isPicked && <span className="text-xs font-semibold">Đáp án đúng</span>}
              {isPicked && !isCorrect && <span className="text-xs font-semibold">Bạn chọn</span>}
            </div>
          );
        })}
      </div>
    );
  }

  const answer = typeof chosen === "string" && chosen.trim() ? chosen : null;
  const learner = withAnswer && (
    <div className={`${box} border-slate-200 bg-white`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bài làm</p>
      <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">{answer ?? "(bỏ trống)"}</p>
    </div>
  );

  if (type === "FILL_BLANK")
    return (
      <div className="grid gap-2">
        {learner}
        <p className={`${box} border-emerald-200 bg-emerald-50 text-emerald-900`}>
          <span className="text-xs font-semibold uppercase tracking-wide">Đáp án chấp nhận: </span>
          {acceptedAnswers(correctAnswer).join(" · ") || "—"}
        </p>
      </div>
    );

  const key = essayKey(correctAnswer);
  return (
    <div className="grid gap-2">
      {learner}
      {withAnswer && answer && (
        <div className={`${box} ${gradingStatus === "PENDING" || gradingStatus === "NEEDS_REVIEW" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-950"}`}>
          {gradingStatus === "PENDING" ? (
            <p>AI đang chấm câu này; điểm sẽ được cộng vào kết quả sau ít phút.</p>
          ) : gradingStatus === "NEEDS_REVIEW" ? (
            <p>AI chưa chấm được câu này. Giảng viên sẽ chấm, điểm cập nhật sau.</p>
          ) : (
            <>
              <p className="font-semibold tabular-nums">Điểm câu này: {Math.round(Number(score ?? 0))}/100</p>
              {feedback && <p className="mt-1 leading-6">{feedback}</p>}
            </>
          )}
        </div>
      )}
      <div className={`${box} border-emerald-200 bg-emerald-50 text-emerald-950`}>
        <p className="text-xs font-semibold uppercase tracking-wide">Bài làm mẫu</p>
        <p className="mt-1 leading-6">{key.model_answer || "—"}</p>
        {key.rubric.length > 0 && (
          <>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide">Các ý chấm điểm</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {key.rubric.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
