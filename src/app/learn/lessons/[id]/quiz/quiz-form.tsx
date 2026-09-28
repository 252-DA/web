"use client";

import { FormEvent, useMemo, useState } from "react";
import { answerKey, quizChoices } from "@/lib/quiz";

type QuizItem = {
  quiz_id: string;
  question: string;
  type: string;
  options: unknown;
};

type QuizResultItem = {
  quizId: string;
  isCorrect: boolean;
  feedback: string | null;
  correctAnswer: unknown;
};

type QuizResult = {
  score: number;
  totalCorrect: number;
  total: number;
  perItem: QuizResultItem[];
  /** Luôn false: điểm được đẩy lên LMS bất đồng bộ sau khi chấm. */
  agsPublished: boolean;
  /** PENDING = đã xếp hàng đẩy về sổ điểm; NOT_REQUIRED = launch không gắn line item. */
  agsStatus: "PENDING" | "NOT_REQUIRED";
  /** Chỉ quiz set: Canvas giữ điểm cao nhất trong các lượt nộp. */
  bestScore?: number;
  attemptCount?: number;
};

type Props = {
  lessonId?: string;
  quizSetId?: string;
  quizItems: QuizItem[];
  resourceLinkId?: string;
  sid?: string;
  previewOnly?: boolean;
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || `Không thể nộp bài (HTTP ${response.status})`;
}

export function QuizForm({
  lessonId,
  quizSetId,
  quizItems,
  resourceLinkId,
  sid,
  previewOnly = false,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const current = quizItems[currentIndex];
  const currentChoices = useMemo(() => quizChoices(current?.options), [current]);
  const answeredCount = quizItems.filter((item) => Object.hasOwn(answers, item.quiz_id)).length;
  const hasCurrentAnswer = current ? Object.hasOwn(answers, current.quiz_id) : false;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewOnly) {
      setMessage("Bản xem trước không gửi câu trả lời và không tạo lượt làm quiz.");
      return;
    }
    if (answeredCount !== quizItems.length) {
      setMessage("Hãy trả lời tất cả câu hỏi trước khi nộp bài.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withSid("/api/quiz/submit", sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          quizSetId,
          resourceLinkId,
          answers: quizItems.map((item) => ({
            quizId: item.quiz_id,
            chosenAnswer: answers[item.quiz_id],
          })),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setResult((await response.json()) as QuizResult);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể nộp quiz.");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setAnswers({});
    setResult(null);
    setMessage("");
    setCurrentIndex(0);
  }

  if (result) {
    const resultByQuiz = new Map(result.perItem.map((item) => [item.quizId, item]));
    return (
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className={result.score >= 70 ? "bg-emerald-600 p-6 text-white" : "bg-amber-500 p-6 text-slate-950"}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Kết quả quiz</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-bold tabular-nums">{result.score}/100</p>
                <p className="mt-1 text-sm font-medium">Đúng {result.totalCorrect}/{result.total} câu</p>
                {result.bestScore !== undefined && (result.attemptCount ?? 1) > 1 && (
                  <p className="mt-1 text-sm font-medium">
                    Lượt thứ {result.attemptCount} · Canvas ghi điểm cao nhất: {result.bestScore}/100
                  </p>
                )}
              </div>
              <button onClick={restart} className="rounded-lg border border-current/30 bg-white/15 px-4 py-2 text-sm font-semibold">
                Làm lại
              </button>
            </div>
          </div>
          <p className="p-4 text-sm text-slate-600">Xem lại từng câu, đáp án đúng và giải thích bên dưới.{result.agsStatus === "PENDING" && " Điểm đã được xếp hàng gửi về sổ điểm Canvas."}</p>
        </section>

        {quizItems.map((item, index) => {
          const itemResult = resultByQuiz.get(item.quiz_id);
          const choices = quizChoices(item.options);
          const chosen = answers[item.quiz_id];
          const correct = itemResult?.correctAnswer;
          return (
            <article key={item.quiz_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Câu {index + 1}</p>
                <span className={itemResult?.isCorrect ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"}>
                  {itemResult?.isCorrect ? "Đúng" : "Chưa đúng"}
                </span>
              </div>
              <h2 className="mt-3 font-semibold leading-7">{item.question}</h2>
              <div className="mt-4 grid gap-2">
                {choices.map((choice, choiceIndex) => {
                  const isChosen = answerKey(choice.value) === answerKey(chosen);
                  const isCorrect = answerKey(choice.value) === answerKey(correct);
                  const className = isCorrect
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : isChosen
                      ? "border-red-300 bg-red-50 text-red-950"
                      : "border-slate-200 bg-white text-slate-600";
                  return (
                    <div key={`${choice.key}-${choiceIndex}`} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${className}`}>
                      <span className="font-semibold">{String.fromCharCode(65 + choiceIndex)}</span>
                      <span className="flex-1">{choice.label}</span>
                      {isCorrect && <span className="text-xs font-semibold">Đáp án đúng</span>}
                      {isChosen && !isCorrect && <span className="text-xs font-semibold">Bạn chọn</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <span className="font-semibold text-slate-900">Giải thích: </span>
                {itemResult?.feedback || "Chưa có giải thích cho câu hỏi này."}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  if (!current) return null;

  return (
    <form onSubmit={submit} className="space-y-5">
      {previewOnly && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900" role="status">
          <span className="font-semibold">Chế độ xem trước cho giảng viên/TA.</span>{" "}
          Bạn có thể duyệt giao diện và chọn thử phương án, nhưng câu trả lời sẽ không được gửi hoặc chấm điểm.
        </p>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-700">Câu {currentIndex + 1}/{quizItems.length}</span>
          <span className="text-slate-500">
            {previewOnly
              ? "Không lưu kết quả"
              : `Đã trả lời ${answeredCount}/${quizItems.length}`}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${((currentIndex + 1) / quizItems.length) * 100}%` }} />
        </div>

        <fieldset className="mt-6">
          <legend className="text-lg font-semibold leading-8 text-slate-950">{current.question}</legend>
          <div className="mt-5 grid gap-3">
            {currentChoices.map((choice, optionIndex) => {
              const selected = answerKey(answers[current.quiz_id]) === answerKey(choice.value);
              return (
                <label
                  key={`${choice.key}-${optionIndex}`}
                  className={
                    selected
                      ? "flex cursor-pointer gap-3 rounded-xl border border-sky-500 bg-sky-50 p-4 text-sm text-sky-950 ring-2 ring-sky-100"
                      : "flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 transition hover:border-slate-400"
                  }
                >
                  <input
                    type="radio"
                    name={current.quiz_id}
                    checked={selected}
                    onChange={() => setAnswers((value) => ({ ...value, [current.quiz_id]: choice.value }))}
                    className="mt-0.5"
                  />
                  <span className="font-semibold text-slate-400">{String.fromCharCode(65 + optionIndex)}</span>
                  <span>{choice.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      {message && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" aria-live="polite">{message}</p>}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          disabled={currentIndex === 0 || busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Câu trước
        </button>
        {currentIndex < quizItems.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((value) => Math.min(quizItems.length - 1, value + 1))}
            disabled={(!previewOnly && !hasCurrentAnswer) || busy}
            className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Câu tiếp theo
          </button>
        ) : previewOnly ? (
          <button
            type="button"
            onClick={() => setCurrentIndex(0)}
            disabled={busy}
            className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quay lại câu đầu
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy || answeredCount !== quizItems.length}
            className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Đang chấm…" : "Nộp bài"}
          </button>
        )}
      </div>
    </form>
  );
}
