"use client";

import { useState, type FormEvent } from "react";
import type { ReviewQuiz } from "@/lib/canvas-quiz";
import { answerKey, bloomLabel, quizChoices } from "@/lib/quiz";

/** Trạng thái câu hỏi trong ngân hàng của DA. */
export const KEPT = ["APPROVED", "PUBLISHED"];
export const DISCARDED = "CHANGES_REQUESTED";
export const NEEDS_REVIEW = ["GENERATED_DRAFT", "REVIEWING"];

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
export const ghostButton =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-40";
export const keepButton =
  "rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40";

const smallButton =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-40";

type Tab = "new" | "bank" | "selected" | "discarded";

/**
 * Bộ chọn câu hỏi cho đề — dùng chung cho hộp thoại module và trang Soạn đề.
 * Tách câu mới sinh (chờ duyệt) khỏi ngân hàng câu đã duyệt, mỗi câu một dòng
 * có ô chọn; chọn một câu mới là duyệt luôn câu đó.
 */
export function QuestionPicker({
  items,
  loOptions,
  selected,
  pending,
  onToggle,
  onSelectMany,
  onClear,
  onDiscard,
  onRestore,
  onSave,
  emptyHint,
}: {
  items: ReviewQuiz[];
  loOptions: Array<{ lo_id: string; code: string }>;
  selected: string[];
  pending: string[];
  onToggle: (quiz: ReviewQuiz, on: boolean) => void;
  /** Chọn nhiều câu: câu mới cần được duyệt trước (cha xử lý). */
  onSelectMany: (quizzes: ReviewQuiz[]) => void;
  onClear: () => void;
  onDiscard: (quiz: ReviewQuiz) => void;
  onRestore: (quiz: ReviewQuiz) => void;
  onSave: (quiz: ReviewQuiz, form: FormData) => Promise<void>;
  emptyHint?: string;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [filterLo, setFilterLo] = useState("");
  const [filterLevel, setFilterLevel] = useState(0);

  const loCode = new Map(loOptions.map((lo) => [lo.lo_id, lo.code]));
  const matches = (q: ReviewQuiz) =>
    (!filterLo || q.lo_id === filterLo) && (!filterLevel || q.bloom_level === filterLevel);
  const groups: Record<Tab, ReviewQuiz[]> = {
    new: items.filter((q) => NEEDS_REVIEW.includes(q.status)),
    bank: items.filter((q) => KEPT.includes(q.status)),
    // Giữ đúng thứ tự đã chọn: đó là thứ tự câu trong đề.
    selected: selected.flatMap((id) => items.filter((q) => q.quiz_id === id)),
    discarded: items.filter((q) => q.status === DISCARDED),
  };
  const shown = groups[tab].filter(matches);
  const selectable = shown.filter((q) => q.status !== DISCARDED && !selected.includes(q.quiz_id));
  const levels = [...new Set(items.map((q) => q.bloom_level).filter((l): l is number => Boolean(l)))].sort();

  const TABS: Array<[Tab, string]> = [
    ["new", "Câu mới"],
    ["bank", "Ngân hàng"],
    ["selected", "Đã chọn vào đề"],
    ["discarded", "Đã bỏ"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="tablist">
          {TABS.map(([key, label]) =>
            key === "discarded" && !groups.discarded.length ? null : (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 ${tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {label}{" "}
                <span className={`tabular-nums ${tab === key ? "text-slate-300" : "text-slate-400"}`}>
                  {groups[key].length}
                </span>
              </button>
            ),
          )}
        </div>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
          value={filterLo}
          onChange={(e) => setFilterLo(e.target.value)}
          aria-label="Lọc theo LO"
        >
          <option value="">Mọi LO</option>
          {loOptions.map((lo) => (
            <option key={lo.lo_id} value={lo.lo_id}>
              {lo.code}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
          value={filterLevel}
          onChange={(e) => setFilterLevel(Number(e.target.value))}
          aria-label="Lọc theo mức Bloom"
        >
          <option value={0}>Mọi mức</option>
          {levels.map((level) => (
            <option key={level} value={level}>
              {bloomLabel(level)}
            </option>
          ))}
        </select>
        <span className="ml-auto flex items-center gap-2 text-xs">
          {tab === "selected"
            ? groups.selected.length > 0 && (
                <button type="button" className={smallButton} onClick={onClear}>
                  Bỏ chọn tất cả
                </button>
              )
            : tab !== "discarded" &&
              selectable.length > 0 && (
                <button
                  type="button"
                  className="rounded-md border border-emerald-600 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                  disabled={selectable.some((q) => pending.includes(q.quiz_id))}
                  onClick={() => onSelectMany(selectable)}
                >
                  Chọn tất cả {selectable.length} câu đang hiện
                </button>
              )}
        </span>
      </div>

      {tab === "new" && groups.new.length > 0 && (
        <p className="text-xs text-slate-500">Tick để đưa câu vào đề (câu được duyệt luôn). Câu không dùng thì bấm Bỏ.</p>
      )}
      {tab === "bank" && (
        <p className="text-xs text-slate-500">Câu đã duyệt từ các lần sinh trước — tick để dùng lại trong đề này.</p>
      )}

      {!shown.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
          {tab === "new"
            ? emptyHint || "Chưa có câu mới. Sinh câu hỏi ở trên, hoặc xem tab Ngân hàng."
            : tab === "bank"
              ? "Ngân hàng chưa có câu đã duyệt cho phạm vi này."
              : tab === "selected"
                ? "Chưa chọn câu nào. Tick câu ở tab Câu mới hoặc Ngân hàng."
                : "Không có câu đã bỏ."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((q, index) => (
            <QuestionRow
              key={`${q.quiz_id}-${q.status}`}
              quiz={q}
              number={tab === "selected" ? index + 1 : undefined}
              loCode={q.lo_id ? loCode.get(q.lo_id) : undefined}
              on={selected.includes(q.quiz_id)}
              pending={pending.includes(q.quiz_id)}
              onToggle={(on) => onToggle(q, on)}
              onDiscard={() => onDiscard(q)}
              onRestore={() => onRestore(q)}
              onSave={(form) => onSave(q, form)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionRow({
  quiz,
  number,
  loCode,
  on,
  pending,
  onToggle,
  onDiscard,
  onRestore,
  onSave,
}: {
  quiz: ReviewQuiz;
  number?: number;
  loCode?: string;
  on: boolean;
  pending: boolean;
  onToggle: (on: boolean) => void;
  onDiscard: () => void;
  onRestore: () => void;
  onSave: (form: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const discarded = quiz.status === DISCARDED;
  const correctKey = answerKey(quiz.correct_answer);

  return (
    <li className={`rounded-lg border ${on ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-3 px-3 py-2">
        {discarded ? (
          <span className="mt-0.5 w-4" aria-hidden />
        ) : (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-700"
            checked={on}
            disabled={pending}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={on ? "Bỏ khỏi đề" : "Chọn vào đề"}
          />
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {number && <span className="font-semibold text-slate-500">Câu {number}</span>}
            {loCode && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{loCode}</span>}
            <span className="text-slate-500">{bloomLabel(quiz.bloom_level)}</span>
            {quiz.status === "GENERATED_DRAFT" && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800">Mới</span>}
            {quiz.status === "REVIEWING" && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Đã sửa</span>}
            {pending && <span className="text-slate-500">Đang lưu…</span>}
          </span>
          <span className={`mt-0.5 block text-sm leading-6 ${open ? "" : "line-clamp-2"}`}>{quiz.question}</span>
        </button>
        <span className="flex shrink-0 gap-1">
          {discarded ? (
            <button type="button" className={smallButton} disabled={pending} onClick={onRestore}>
              Khôi phục
            </button>
          ) : (
            <>
              <button type="button" className={smallButton} disabled={pending} onClick={() => { setEditing(true); setOpen(true); }}>
                Sửa
              </button>
              {!on && !KEPT.includes(quiz.status) && (
                <button type="button" className={smallButton} disabled={pending} onClick={onDiscard}>
                  Bỏ
                </button>
              )}
            </>
          )}
        </span>
      </div>
      {open && (
        <div className="border-t border-slate-100 px-3 py-2">
          {editing ? (
            <QuestionEditForm
              quiz={quiz}
              pending={pending}
              onCancel={() => setEditing(false)}
              onSave={async (form) => {
                await onSave(form);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {quizChoices(quiz.options).map((c, i) => {
                  const correct = answerKey(c.value) === correctKey;
                  return (
                    <p
                      key={c.key}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700"}`}
                    >
                      <strong>{String.fromCharCode(65 + i)}.</strong> {c.label}
                      {correct && <span className="ml-1 text-xs">✓</span>}
                    </p>
                  );
                })}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                <span className="text-xs text-slate-500">Giải thích · dựa trên {quiz.source_chunk_ids.length} đoạn slide: </span>
                {quiz.explanation || "Chưa có giải thích."}
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function QuestionEditForm({
  quiz,
  pending,
  onSave,
  onCancel,
}: {
  quiz: ReviewQuiz;
  pending: boolean;
  onSave: (form: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const choices = quizChoices(quiz.options);
  const correctIndex = Math.max(
    0,
    choices.findIndex((c) => answerKey(c.value) === answerKey(quiz.correct_answer)),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(new FormData(event.currentTarget));
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="grid gap-1 text-sm">
        Câu hỏi
        <textarea name="question" required className={inputClass} defaultValue={quiz.question} rows={3} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="grid gap-1 text-sm">
            Phương án {String.fromCharCode(65 + i)}
            <input name={`option_${i}`} required className={inputClass} defaultValue={choices[i]?.label || ""} />
          </label>
        ))}
      </div>
      <label className="grid gap-1 text-sm">
        Đáp án đúng
        <select name="correctIndex" className={`${inputClass} w-32`} defaultValue={correctIndex}>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              {String.fromCharCode(65 + i)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Giải thích
        <textarea name="explanation" className={inputClass} defaultValue={quiz.explanation || ""} rows={3} />
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className={keepButton}>
          Lưu
        </button>
        <button type="button" onClick={onCancel} className={ghostButton}>
          Hủy sửa
        </button>
      </div>
    </form>
  );
}
