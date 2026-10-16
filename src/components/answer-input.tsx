"use client";

import { answerKey, quizChoices } from "@/lib/quiz";
import { MAX_SHORT_ANSWER_CHARS } from "@/lib/question-types";

const choiceOn =
  "flex cursor-pointer gap-3 rounded-xl border border-sky-500 bg-sky-50 text-sm text-sky-950 ring-2 ring-sky-100";
const choiceOff =
  "flex cursor-pointer gap-3 rounded-xl border border-slate-200 text-sm text-slate-700 transition hover:border-slate-400";
const textBox =
  "w-full rounded-xl border border-slate-300 bg-white text-sm leading-6 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

/**
 * Ô trả lời của một câu, theo kiểu câu. Giá trị gửi lên core-api:
 * MCQ_SINGLE/TRUE_FALSE một phương án, MCQ_MULTI mảng phương án, FILL_BLANK và
 * SHORT_ANSWER chuỗi.
 */
export function AnswerInput({
  item,
  value,
  onChange,
  roomy = false,
}: {
  item: { quiz_id: string; type: string; options: unknown };
  value: unknown;
  onChange: (value: unknown) => void;
  /** Trang luyện tập một câu một màn: ô to hơn. */
  roomy?: boolean;
}) {
  const pad = roomy ? "p-4" : "p-3";

  if (item.type === "FILL_BLANK")
    return (
      <input
        type="text"
        maxLength={200}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Điền vào chỗ trống ____"
        aria-label="Câu trả lời điền vào chỗ trống"
        className={`${textBox} ${pad}`}
      />
    );

  if (item.type === "SHORT_ANSWER") {
    const text = typeof value === "string" ? value : "";
    return (
      <div className="grid gap-1">
        <textarea
          rows={roomy ? 6 : 4}
          maxLength={MAX_SHORT_ANSWER_CHARS}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Trả lời ngắn gọn trong 1–3 câu."
          aria-label="Câu trả lời tự luận"
          className={`${textBox} ${pad}`}
        />
        <p className="text-right text-xs tabular-nums text-slate-500">
          {text.length}/{MAX_SHORT_ANSWER_CHARS} · AI chấm theo các ý chính sau khi nộp
        </p>
      </div>
    );
  }

  const multi = item.type === "MCQ_MULTI";
  const picked = new Set(multi && Array.isArray(value) ? value.map(answerKey) : [answerKey(value)]);
  const choices = quizChoices(item.options);
  return (
    <div className="grid gap-2">
      {multi && <p className="text-xs font-medium text-slate-500">Chọn tất cả đáp án đúng.</p>}
      {choices.map((choice, i) => {
        const key = answerKey(choice.value);
        const selected = value !== undefined && picked.has(key);
        return (
          <label key={`${choice.key}-${i}`} className={`${selected ? choiceOn : choiceOff} ${pad}`}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={item.quiz_id}
              checked={selected}
              onChange={() => {
                if (!multi) return onChange(choice.value);
                const current = Array.isArray(value) ? value : [];
                // Giữ thứ tự hiển thị của phương án; core-api chấm theo tập nên thứ tự không đổi điểm.
                const next = selected
                  ? current.filter((v) => answerKey(v) !== key)
                  : choices.map((c) => c.value).filter((v) => picked.has(answerKey(v)) || answerKey(v) === key);
                onChange(next);
              }}
              className="mt-0.5"
            />
            <span className="font-semibold text-slate-400">{String.fromCharCode(65 + i)}</span>
            <span>{choice.label}</span>
          </label>
        );
      })}
    </div>
  );
}
