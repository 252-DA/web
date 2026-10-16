"use client";

import { useState } from "react";
import {
  QUESTION_TYPES,
  TRUE_FALSE_OPTIONS,
  type QuestionType,
} from "@/lib/question-types";

export type QuestionDraft = {
  id?: string;
  position: number;
  type: QuestionType;
  question: string;
  options: unknown;
  correctAnswer: unknown;
  explanation: string;
};

interface Props {
  microContentId: string;
  initialQuestions: QuestionDraft[];
  sid: string;
}

export function QuestionPanel({ microContentId, initialQuestions, sid }: Props) {
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    initialQuestions.map((q, idx) => ({
      ...q,
      position: idx + 1,
      explanation: q.explanation || "",
    })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
                  {(Array.isArray(q.options) ? q.options : ["", "", "", ""]).map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`mcq_single_${index}`}
                        checked={q.correctAnswer === opt && Boolean(opt)}
                        onChange={() => updateQuestion(index, { correctAnswer: opt })}
                        className="h-4 w-4 text-sky-600 focus:ring-sky-500"
                      />
                      <input
                        type="text"
                        value={String(opt)}
                        onChange={(e) => {
                          const newOpts = [...(q.options as string[])];
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
                  ))}
                  <p className="text-xs text-slate-500">Tick chọn phương án đúng duy nhất.</p>
                </div>
              )}

              {q.type === "MCQ_MULTI" && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Các phương án (nhiều đáp án đúng)
                  </label>
                  {(Array.isArray(q.options) ? q.options : ["", "", "", ""]).map((opt, optIdx) => {
                    const isChecked =
                      Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt);
                    return (
                      <div key={optIdx} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked && Boolean(opt)}
                          onChange={(e) => {
                            const current = Array.isArray(q.correctAnswer)
                              ? [...q.correctAnswer]
                              : [];
                            const updated = e.target.checked
                              ? [...current, opt]
                              : current.filter((x) => x !== opt);
                            updateQuestion(index, { correctAnswer: updated });
                          }}
                          className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                        />
                        <input
                          type="text"
                          value={String(opt)}
                          onChange={(e) => {
                            const newOpts = [...(q.options as string[])];
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
                      value={(q.correctAnswer as any)?.model_answer || ""}
                      onChange={(e) => {
                        const current = (q.correctAnswer as any) || { rubric: [] };
                        updateQuestion(index, {
                          correctAnswer: { ...current, model_answer: e.target.value },
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
                        Array.isArray((q.correctAnswer as any)?.rubric)
                          ? (q.correctAnswer as any).rubric.join("\n")
                          : ""
                      }
                      onChange={(e) => {
                        const lines = e.target.value
                          .split("\n")
                          .map((l) => l.trim())
                          .filter(Boolean);
                        const current = (q.correctAnswer as any) || { model_answer: "" };
                        updateQuestion(index, {
                          correctAnswer: { ...current, rubric: lines },
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
