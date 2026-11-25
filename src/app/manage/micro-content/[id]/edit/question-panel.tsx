"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUESTION_TYPES,
  TRUE_FALSE_OPTIONS,
  type QuestionType,
} from "@/lib/question-types";

export type ShortAnswerKey = {
  model_answer?: string;
  rubric?: string[];
};

function asShortAnswerKey(value: unknown): ShortAnswerKey {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ShortAnswerKey;
  }
  return {};
}

export type QuestionDraft = {
  id?: string;
  position: number;
  type: QuestionType;
  question: string;
  options: unknown;
  correctAnswer: unknown;
  explanation: string;
};

export function normalizeOptionValue(opt: unknown): string {
  if (opt === null || opt === undefined) return "";
  if (typeof opt === "object") {
    const record = opt as Record<string, unknown>;
    return String(record.text ?? record.label ?? record.value ?? "");
  }
  return String(opt);
}

export function normalizeQuestionItem(q: QuestionDraft, idx: number): QuestionDraft {
  let opts = q.options;
  let correct = q.correctAnswer;

  if (Array.isArray(opts)) {
    const normalizedOpts = opts.map(normalizeOptionValue);
    // Nếu correctAnswer là chữ cái mã hóa ("A", "B", "C", "D") và options ban đầu là objects
    if (typeof correct === "string" && correct.length === 1) {
      const correctUpper = correct.toUpperCase();
      const matchIdx = opts.findIndex((o) => {
        if (typeof o === "object" && o !== null) {
          const rec = o as Record<string, unknown>;
          return String(rec.key ?? rec.id ?? "").toUpperCase() === correctUpper;
        }
        return false;
      });
      if (matchIdx >= 0) {
        correct = normalizedOpts[matchIdx];
      }
    }
    opts = normalizedOpts;
  }

  return {
    ...q,
    position: idx + 1,
    options: opts,
    correctAnswer: correct,
    explanation: q.explanation || "",
  };
}

interface Props {
  microContentId: string;
  initialQuestions: QuestionDraft[];
  sid: string;
}

export function QuestionPanel({ microContentId, initialQuestions, sid }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    initialQuestions.map(normalizeQuestionItem),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [quizCount, setQuizCount] = useState<number>(3);
  const [quizTypes, setQuizTypes] = useState<string[]>([
    "MCQ_SINGLE",
    "TRUE_FALSE",
    "SHORT_ANSWER",
  ]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  useEffect(() => {
    if (!generatingQuiz) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/micro-content/${microContentId}/ai?type=micro_quiz&sid=${encodeURIComponent(sid)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const req = data.request as { status?: string; last_error?: string } | null;
        if (!req) return;

        if (req.status === "SUCCEEDED") {
          const itemRes = await fetch(
            `/api/micro-content/${microContentId}?sid=${encodeURIComponent(sid)}`,
            { cache: "no-store" },
          );
          if (itemRes.ok && !cancelled) {
            const item = await itemRes.json();
            if (Array.isArray(item.questions)) {
              setQuestions(
                item.questions.map(normalizeQuestionItem),
              );
            }
          }
          if (!cancelled) {
            setGeneratingQuiz(false);
            setMessage({
              text: "AI đã sinh và kiểm chứng xong bộ câu hỏi củng cố!",
              type: "success",
            });
            router.refresh();
          }
        } else if (req.status === "FAILED") {
          if (!cancelled) {
            setGeneratingQuiz(false);
            setMessage({
              text: req.last_error || "Sinh câu hỏi củng cố thất bại.",
              type: "error",
            });
          }
        }
      } catch {
        // Bỏ qua lỗi mạng thoáng qua
      }
    };

    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generatingQuiz, microContentId, sid, router]);

  const toggleQuizType = (value: string) => {
    setQuizTypes((prev) =>
      prev.includes(value)
        ? prev.length > 1
          ? prev.filter((item) => item !== value)
          : prev
        : [...prev, value],
    );
  };

  const handleGenerateQuiz = async () => {
    if (
      questions.length > 0 &&
      !window.confirm(
        `Sinh lại bộ câu hỏi mới sẽ thay thế ${questions.length} câu hỏi hiện có. Tiếp tục?`,
      )
    ) {
      return;
    }

    setGeneratingQuiz(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/micro-content/${microContentId}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request_quiz",
            count: quizCount,
            questionTypes: quizTypes,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gửi yêu cầu sinh câu hỏi.");
      }
    } catch (err) {
      setGeneratingQuiz(false);
      setMessage({
        text: err instanceof Error ? err.message : "Đã có lỗi khi gửi yêu cầu AI.",
        type: "error",
      });
    }
  };

  const addQuestion = (type: QuestionType) => {
    let initialOptions: unknown = null;
    let initialCorrect: unknown = "";

    switch (type) {
      case "MCQ_SINGLE":
        initialOptions = ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"];
        initialCorrect = "Lựa chọn A";
        break;
      case "MCQ_MULTI":
        initialOptions = ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"];
        initialCorrect = ["Lựa chọn A"];
        break;
      case "TRUE_FALSE":
        initialOptions = TRUE_FALSE_OPTIONS;
        initialCorrect = "Đúng";
        break;
      case "FILL_BLANK":
        initialOptions = null;
        initialCorrect = ["Đáp án 1"];
        break;
      case "SHORT_ANSWER":
        initialOptions = null;
        initialCorrect = {
          model_answer: "Câu trả lời mẫu...",
          rubric: ["Ý chính 1", "Ý chính 2"],
        };
        break;
    }

    setQuestions((prev) => [
      ...prev,
      {
        position: prev.length + 1,
        type,
        question: type === "FILL_BLANK" ? "Nội dung câu hỏi với chỗ trống ____" : "",
        options: initialOptions,
        correctAnswer: initialCorrect,
        explanation: "",
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, idx) => ({ ...q, position: idx + 1 })),
    );
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy.map((q, idx) => ({ ...q, position: idx + 1 }));
    });
  };

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/micro-content/${microContentId}/questions?sid=${encodeURIComponent(sid)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể lưu danh sách câu hỏi");
      }

      setMessage({ text: "Đã lưu thành công các câu hỏi!", type: "success" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sinh câu hỏi củng cố bằng AI */}
      <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sinh câu hỏi củng cố</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              AI tạo câu hỏi bám đúng các trang slide nguồn và kịch bản bài học, kèm giải thích rõ nguồn.
              {questions.length > 0 && ` Lưu ý: sinh mới sẽ thay thế ${questions.length} câu hiện có.`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateQuiz}
            disabled={generatingQuiz}
            className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {generatingQuiz ? "AI đang sinh câu hỏi..." : "Sinh câu hỏi củng cố"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <span className="font-medium">Số câu:</span>
            <select
              value={quizCount}
              onChange={(e) => setQuizCount(Number(e.target.value))}
              disabled={generatingQuiz}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={2}>2 câu</option>
              <option value={3}>3 câu</option>
              <option value={4}>4 câu</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">Dạng câu hỏi:</span>
            {[
              { value: "MCQ_SINGLE", label: "Trắc nghiệm 1 đáp án" },
              { value: "TRUE_FALSE", label: "Đúng / Sai" },
              { value: "SHORT_ANSWER", label: "Tự luận ngắn" },
              { value: "FILL_BLANK", label: "Điền khuyết" },
            ].map((opt) => (
              <label key={opt.value} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quizTypes.includes(opt.value)}
                  onChange={() => toggleQuizType(opt.value)}
                  disabled={generatingQuiz}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg p-4 text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-600">Chưa có câu hỏi nào trong bài Micro Content này.</p>
          <p className="mt-1 text-xs text-slate-500">
            Chọn một kiểu câu hỏi bên dưới để bắt đầu soạn đề.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-100">
                    {QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    title="Di chuyển lên"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === questions.length - 1}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    title="Di chuyển xuống"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    className="ml-2 rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                    title="Xoá câu hỏi"
                  >
                    ✕ Xoá
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Nội dung câu hỏi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={q.question}
                  onChange={(e) => updateQuestion(index, { question: e.target.value })}
                  placeholder={
                    q.type === "FILL_BLANK"
                      ? "Ví dụ: Thủ đô của Việt Nam là ____."
                      : "Nhập nội dung câu hỏi..."
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
                {q.type === "FILL_BLANK" && (
                  <p className="mt-1 text-xs text-amber-600">
                    Bắt buộc phải có chỗ trống được đánh dấu bằng ít nhất 3 dấu gạch dưới (____).
                  </p>
                )}
              </div>

              {/* Tùy chỉnh đáp án theo từng loại */}
              {q.type === "MCQ_SINGLE" && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Phương án & Đáp án đúng
                  </label>
                  {(Array.isArray(q.options) ? q.options : ["", "", "", ""]).map((opt, optIdx) => {
                    const optText = normalizeOptionValue(opt);
                    const isChecked = Boolean(optText) && (
                      q.correctAnswer === optText ||
                      q.correctAnswer === opt ||
                      (typeof q.correctAnswer === "string" &&
                        q.correctAnswer.toUpperCase() === String.fromCharCode(65 + optIdx))
                    );
                    return (
                      <div key={optIdx} className="flex items-center gap-3">
                        <input
                          type="radio"
                          name={`mcq_single_${index}`}
                          checked={isChecked}
                          onChange={() => updateQuestion(index, { correctAnswer: optText })}
                          className="h-4 w-4 text-sky-600 focus:ring-sky-500"
                        />
                        <input
                          type="text"
                          value={optText}
                          onChange={(e) => {
                            const newOpts = (Array.isArray(q.options) ? q.options : []).map(normalizeOptionValue);
                            while (newOpts.length <= optIdx) newOpts.push("");
                            const oldVal = newOpts[optIdx];
                            newOpts[optIdx] = e.target.value;
                            updateQuestion(index, {
                              options: newOpts,
                              correctAnswer: q.correctAnswer === oldVal ? e.target.value : q.correctAnswer,
                            });
                          }}
                          placeholder={`Lựa chọn ${String.fromCharCode(65 + optIdx)}`}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">Tick chọn phương án đúng duy nhất.</p>
                </div>
              )}

              {q.type === "MCQ_MULTI" && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Các phương án (nhiều đáp án đúng)
                  </label>
                  {(Array.isArray(q.options) ? q.options : ["", "", "", ""]).map((opt, optIdx) => {
                    const optText = normalizeOptionValue(opt);
                    const isChecked =
                      Array.isArray(q.correctAnswer) &&
                      (q.correctAnswer.includes(optText) || q.correctAnswer.includes(opt));
                    return (
                      <div key={optIdx} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked && Boolean(optText)}
                          onChange={(e) => {
                            const current = Array.isArray(q.correctAnswer)
                              ? [...q.correctAnswer]
                              : [];
                            const updated = e.target.checked
                              ? [...current, optText]
                              : current.filter((x) => x !== optText && x !== opt);
                            updateQuestion(index, { correctAnswer: updated });
                          }}
                          className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                        />
                        <input
                          type="text"
                          value={optText}
                          onChange={(e) => {
                            const newOpts = (Array.isArray(q.options) ? q.options : []).map(normalizeOptionValue);
                            while (newOpts.length <= optIdx) newOpts.push("");
                            const oldVal = newOpts[optIdx];
                            newOpts[optIdx] = e.target.value;
                            const updatedCorrect = Array.isArray(q.correctAnswer)
                              ? q.correctAnswer.map((x) => (x === oldVal ? e.target.value : x))
                              : [];
                            updateQuestion(index, {
                              options: newOpts,
                              correctAnswer: updatedCorrect,
                            });
                          }}
                          placeholder={`Lựa chọn ${String.fromCharCode(65 + optIdx)}`}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">Tick chọn tất cả các phương án đúng.</p>
                </div>
              )}

              {q.type === "TRUE_FALSE" && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Mệnh đề trên là
                  </label>
                  <div className="flex gap-6">
                    {TRUE_FALSE_OPTIONS.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name={`tf_${index}`}
                          checked={q.correctAnswer === opt}
                          onChange={() => updateQuestion(index, { correctAnswer: opt })}
                          className="h-4 w-4 text-sky-600 focus:ring-sky-500"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {q.type === "FILL_BLANK" && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Đáp án chấp nhận (mỗi dòng một cách viết)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      Array.isArray(q.correctAnswer)
                        ? q.correctAnswer.join("\n")
                        : String(q.correctAnswer || "")
                    }
                    onChange={(e) => {
                      const lines = e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean);
                      updateQuestion(index, { correctAnswer: lines });
                    }}
                    placeholder="Việt Nam&#10;Vietnam&#10;viet nam"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                  <p className="text-xs text-slate-500">Hệ thống chấm không phân biệt chữ hoa, chữ thường.</p>
                </div>
              )}

              {q.type === "SHORT_ANSWER" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500">
                      Bài làm mẫu (đạt điểm tối đa)
                    </label>
                    <textarea
                      rows={2}
                      value={asShortAnswerKey(q.correctAnswer).model_answer || ""}
                      onChange={(e) => {
                        const current = asShortAnswerKey(q.correctAnswer);
                        updateQuestion(index, {
                          correctAnswer: { rubric: [], ...current, model_answer: e.target.value },
                        });
                      }}
                      placeholder="Bài làm mẫu đạt điểm tối đa..."
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500">
                      Rubric chấm điểm (mỗi dòng một ý chấm điểm)
                    </label>
                    <textarea
                      rows={3}
                      value={
                        Array.isArray(asShortAnswerKey(q.correctAnswer).rubric)
                          ? asShortAnswerKey(q.correctAnswer).rubric!.join("\n")
                          : ""
                      }
                      onChange={(e) => {
                        const lines = e.target.value
                          .split("\n")
                          .map((l) => l.trim())
                          .filter(Boolean);
                        const current = asShortAnswerKey(q.correctAnswer);
                        updateQuestion(index, {
                          correctAnswer: { model_answer: "", ...current, rubric: lines },
                        });
                      }}
                      placeholder="Ý 1: Nêu đúng định nghĩa (ngang điểm)&#10;Ý 2: Nêu được ví dụ minh họa"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Giải thích đáp án (hiển thị cho học viên sau khi nộp bài)
                </label>
                <input
                  type="text"
                  value={q.explanation}
                  onChange={(e) => updateQuestion(index, { explanation: e.target.value })}
                  placeholder="Giải thích chi tiết tại sao đáp án đúng..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Thanh thêm câu hỏi */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase text-slate-500">Thêm câu hỏi mới:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUESTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => addQuestion(t.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-700 transition"
            >
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Đang lưu câu hỏi..." : "Lưu tất cả câu hỏi"}
        </button>
      </div>
    </div>
  );
}

