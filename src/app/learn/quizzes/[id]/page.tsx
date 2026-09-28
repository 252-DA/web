import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import {
  GRADE_SYNC,
  type LearnerQuizResults,
  type QuizSetSettings,
  type StaffQuizResults,
} from "@/lib/canvas-quiz";
import { answerKey, quizChoices } from "@/lib/quiz";
import { QuizForm } from "../../lessons/[id]/quiz/quiz-form";
import { ExamPanel } from "./exam-panel";
import { QuizReport } from "./quiz-report";

type QuizSet = {
  quiz_set_id: string;
  title: string;
  settings: QuizSetSettings;
  questionCount: number;
  items: Array<{
    quiz_id: string;
    question: string;
    type: string;
    options: unknown;
  }>;
};

const time = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function errorPage(error: unknown) {
  return (
    <main className="p-8">
      {error instanceof Error ? error.message : "Không tải được quiz."}
    </main>
  );
}

export default async function CanvasQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (
    !active ||
    active.session.targetKind !== "quiz_set" ||
    active.session.targetId !== id
  )
    return (
      <main className="p-8">Mở quiz từ bài tập trong Canvas để bắt đầu.</main>
    );
  const claims = claimsFromSession(active.session);

  // Giảng viên mở bài tập từ Canvas: xem đáp án, kết quả và trạng thái điểm.
  if (active.session.courseRole !== "learner") {
    let report: StaffQuizResults;
    try {
      report = await coreApi.quizSetResults<StaffQuizResults>(id, claims);
    } catch (error) {
      return errorPage(error);
    }
    return <QuizReport report={report} />;
  }

  let quiz: QuizSet;
  let history: LearnerQuizResults | null;
  try {
    [quiz, history] = await Promise.all([
      coreApi.getQuizSet<QuizSet>(id, claims),
      // Lịch sử chỉ để tham khảo — lỗi ở đây không được chặn việc làm bài.
      coreApi
        .quizSetResults<LearnerQuizResults>(id, claims)
        .catch(() => null),
    ]);
  } catch (error) {
    return errorPage(error);
  }
  const attempts = history?.attempts ?? [];
  if (quiz.settings.mode === "exam")
    return (
      <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
        <div className="mx-auto max-w-3xl space-y-5">
          <header>
            <p className="text-sm text-slate-500">DA Platform · Bài kiểm tra</p>
            <h1 className="mt-1 text-2xl font-semibold">{quiz.title}</h1>
            {history?.bestScore !== null && history?.bestScore !== undefined && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                Điểm cao nhất:{" "}
                <strong className="tabular-nums">
                  {Math.round(history.bestScore * quiz.settings.pointsPossible) / 100}/
                  {quiz.settings.pointsPossible}
                </strong>
                {history.sync && (
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${GRADE_SYNC[history.sync].tone}`}>
                    {GRADE_SYNC[history.sync].label}
                  </span>
                )}
              </p>
            )}
          </header>
          <ExamPanel
            quizSetId={quiz.quiz_set_id}
            resourceLinkId={active.session.resourceLinkId}
            sid={active.sid}
            questionCount={quiz.questionCount}
            settings={quiz.settings}
            state={history}
          />
          {history?.review && <ExamReview review={history.review} />}
        </div>
      </main>
    );
  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="text-sm text-slate-500">DA Platform · Quiz</p>
          <h1 className="mt-1 text-2xl font-semibold">{quiz.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {quiz.items.length} câu · Thang điểm 100 · Được làm lại, Canvas ghi
            điểm cao nhất
          </p>
        </header>
        {history && attempts.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                Bạn đã làm <strong>{attempts.length}</strong> lần · Điểm cao
                nhất <strong className="tabular-nums">{history.bestScore}/100</strong>
              </p>
              {history.sync && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${GRADE_SYNC[history.sync].tone}`}
                >
                  {GRADE_SYNC[history.sync].label}
                </span>
              )}
            </div>
            <details className="mt-2 text-slate-600">
              <summary className="cursor-pointer text-xs text-slate-500">
                Các lượt đã nộp
              </summary>
              <ul className="mt-1 space-y-0.5">
                {[...attempts].reverse().map((a, i) => (
                  <li key={a.submissionId} className="flex gap-3 tabular-nums">
                    <span className="w-14 text-slate-500">Lần {attempts.length - i}</span>
                    <span className="w-16">{a.score}/100</span>
                    <span className="text-slate-500">
                      {time.format(new Date(a.attemptedAt))}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
        <QuizForm
          quizSetId={quiz.quiz_set_id}
          quizItems={quiz.items}
          resourceLinkId={active.session.resourceLinkId}
          sid={active.sid}
        />
      </div>
    </main>
  );
}

/** Bài làm lần gần nhất, chỉ có khi bài kiểm tra đã đóng. */
function ExamReview({ review }: { review: NonNullable<LearnerQuizResults["review"]> }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Bài làm lần gần nhất</h2>
      {review.map((item, index) => {
        const correct = answerKey(item.correct_answer);
        const chosen = item.chosen === null ? null : answerKey(item.chosen);
        return (
          <article key={item.quiz_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Câu {index + 1}</p>
              <span
                className={
                  item.is_correct
                    ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                    : "rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"
                }
              >
                {item.is_correct ? "Đúng" : chosen === null ? "Bỏ trống" : "Chưa đúng"}
              </span>
            </div>
            <p className="mt-2 font-semibold leading-7">{item.question}</p>
            <div className="mt-3 grid gap-2">
              {quizChoices(item.options).map((c, i) => {
                const key = answerKey(c.value);
                const tone =
                  key === correct
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : key === chosen
                      ? "border-red-300 bg-red-50 text-red-950"
                      : "border-slate-200 text-slate-600";
                return (
                  <div key={`${c.key}-${i}`} className={`flex gap-3 rounded-xl border p-3 text-sm ${tone}`}>
                    <span className="font-semibold">{String.fromCharCode(65 + i)}</span>
                    <span className="flex-1">{c.label}</span>
                    {key === correct && <span className="text-xs font-semibold">Đáp án đúng</span>}
                    {key === chosen && key !== correct && <span className="text-xs font-semibold">Bạn chọn</span>}
                  </div>
                );
              })}
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
