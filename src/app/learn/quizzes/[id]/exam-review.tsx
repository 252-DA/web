import { AnswerReview } from "@/components/answer-review";
import type { LearnerQuizResults } from "@/lib/canvas-quiz";

/** Bài làm lần gần nhất, chỉ có khi bài kiểm tra đã đóng. */
export function ExamReview({
  review,
  title = "Bài làm lần gần nhất",
}: {
  review: NonNullable<LearnerQuizResults["review"]>;
  title?: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {review.map((item, index) => {
        const blank = item.chosen === null || (typeof item.chosen === "string" && !item.chosen.trim());
        const badge =
          item.grading_status === "PENDING"
            ? ["AI đang chấm", "bg-violet-100 text-violet-800"]
            : item.grading_status === "NEEDS_REVIEW"
              ? ["Chờ giảng viên chấm", "bg-amber-100 text-amber-900"]
              : item.type === "SHORT_ANSWER" && !blank
                ? [`${Math.round(item.score)}/100`, item.score >= 50 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"]
                : item.is_correct
                  ? ["Đúng", "bg-emerald-100 text-emerald-800"]
                  : [blank ? "Bỏ trống" : "Chưa đúng", "bg-red-100 text-red-800"];
        return (
          <article key={item.quiz_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Câu {index + 1}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge[1]}`}>{badge[0]}</span>
            </div>
            <p className="mt-2 font-semibold leading-7">{item.question}</p>
            <div className="mt-3">
              <AnswerReview
                type={item.type}
                options={item.options}
                correctAnswer={item.correct_answer}
                chosen={item.chosen}
                score={item.score}
                feedback={item.type === "SHORT_ANSWER" ? item.feedback : null}
                gradingStatus={item.grading_status}
              />
            </div>
            {item.explanation && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                <span className="font-semibold text-slate-900">Giải thích: </span>
                {item.explanation}
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
