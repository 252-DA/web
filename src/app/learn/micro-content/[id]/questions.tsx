"use client";

import { useState } from "react";
import { AnswerInput } from "@/components/answer-input";
import { AnswerReview } from "@/components/answer-review";
import { isAnswered } from "@/lib/question-types";

interface Props {
  microContentId: string;
  questions: Array<{
    id: string;
    position: number;
    type: string;
    question: string;
    options: unknown;
  }>;
  requiredWatchPercent: number;
  passingScore: number;
  sid: string;
  isStaff: boolean;
  unlocked: boolean;
  watchedPercent: number;
}

export function MicroContentQuestions({
  microContentId,
  questions,
  requiredWatchPercent,
  passingScore,
  sid,
  isStaff,
  unlocked,
  watchedPercent,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const canAttempt = isStaff || unlocked || requiredWatchPercent === 0;

  const handleAnswerChange = (questionId: string, val: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => isAnswered(q.type, answers[q.id]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) {
      setError("Vui lòng trả lời đầy đủ tất cả các câu hỏi trước khi nộp bài.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          chosenAnswer: answers[q.id],
        })),
      };

      const res = await fetch(
        `/api/micro-content/${microContentId}/submit?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể nộp bài");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = () => {
    setAnswers({});
    setResult(null);
    setError(null);
  };

  if (!canAttempt) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
        <span className="text-3xl">🔒</span>
        <h3 className="mt-2 text-base font-semibold text-amber-900">
          Câu hỏi củng cố đang tạm khóa
        </h3>
        <p className="mt-1 text-sm text-amber-700">
          Bạn cần xem video để mở khóa bài tập.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-amber-800 shadow-sm border border-amber-200">
          Tiến độ xem: {watchedPercent}% / Yêu cầu: {requiredWatchPercent}%
        </div>
      </div>
    );
  }

  // Màn hình kết quả sau khi nộp
  if (result) {
    const hasPending = result.gradingStatus === "PENDING";

    return (
      <div className="space-y-6">
        <div
          className={`rounded-xl border p-6 shadow-sm ${
            result.passed
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{result.passed ? "🎉" : "💪"}</span>
                <h3 className="text-xl font-bold">
                  {result.passed ? "Chúc mừng! Bạn đã đạt bài học" : "Chưa đạt yêu cầu"}
                </h3>
              </div>
              <p className="mt-1 text-sm opacity-80">
                Điểm của bạn: <strong className="text-lg">{result.score}%</strong> (Yêu cầu:{" "}
                {passingScore}%)
              </p>
              {hasPending && (
                <p className="mt-2 text-xs font-medium text-amber-800 bg-amber-100 rounded px-2.5 py-1 inline-block">
                  ⏳ Câu hỏi tự luận đang được AI chấm điểm, điểm số tạm thời có thể thay đổi sau.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleRetake}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow hover:bg-slate-100"
            >
              🔄 Làm lại bài kiểm tra
            </button>
          </div>
        </div>

        {/* Xem lại từng câu hỏi kèm đáp án và giải thích */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-slate-900">Chi tiết bài làm:</h3>
          {result.questions?.map((item: any, idx: number) => (
            <div
              key={item.questionId || idx}
              className={`rounded-xl border bg-white p-5 shadow-sm space-y-3 ${
                item.gradingStatus === "PENDING"
                  ? "border-amber-200"
                  : item.isCorrect
                  ? "border-emerald-200"
                  : "border-rose-200"
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-medium text-slate-900">{item.question}</p>
                </div>
                <div>
                  {item.gradingStatus === "PENDING" ? (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                      AI đang chấm
                    </span>
                  ) : item.isCorrect ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                      ✓ Đúng (+{item.score}đ)
                    </span>
                  ) : (
                    <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                      ✕ Sai (0đ)
                    </span>
                  )}
                </div>
              </div>

              {/* Tái sử dụng AnswerReview */}
              <AnswerReview
                type={item.type}
                options={item.options}
                correctAnswer={item.correctAnswer}
                chosen={item.chosenAnswer}
                score={item.score}
                feedback={item.feedback}
                gradingStatus={item.gradingStatus}
              />

              {item.explanation && (
                <div className="rounded-lg bg-sky-50/60 p-3 text-xs text-sky-900 border border-sky-100">
                  <strong className="font-semibold">Giải thích:</strong> {item.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Form làm bài
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 border border-rose-200">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {idx + 1}
              </span>
              <p className="text-sm font-semibold text-slate-900">{q.question}</p>
            </div>

            {/* Tái sử dụng AnswerInput */}
            <AnswerInput
              item={{ quiz_id: q.id, type: q.type, options: q.options }}
              value={answers[q.id]}
              onChange={(val) => handleAnswerChange(q.id, val)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">
          Điểm qua bài: <strong>{passingScore}%</strong> · Bạn có thể làm lại nhiều lần.
        </p>
        <button
          type="submit"
          disabled={submitting || !allAnswered}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
        >
          {submitting ? "Đang chấm bài..." : "Nộp bài kiểm tra"}
        </button>
      </div>
    </form>
  );
}
