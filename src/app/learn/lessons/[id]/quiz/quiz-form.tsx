"use client";

import { FormEvent, useState } from "react";

type QuizItem = {
  quiz_id: string;
  question: string;
  type: string;
  options: unknown;
  explanation: string | null;
};

type Props = {
  lessonId: string;
  quizItems: QuizItem[];
  resourceLinkId?: string;
  sid?: string;
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function optionsOf(item: QuizItem): Array<{ label: string; value: unknown }> {
  if (Array.isArray(item.options)) {
    return item.options.map((option, index) => {
      if (typeof option === "object" && option && "text" in option) {
        return { label: String((option as { text: unknown }).text), value: option };
      }
      return { label: String(option), value: option };
    });
  }
  if (item.options && typeof item.options === "object") {
    return Object.entries(item.options).map(([key, value]) => ({
      label: `${key}. ${String(value)}`,
      value: key,
    }));
  }
  return [];
}

function parseAnswer(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function QuizForm({ lessonId, quizItems, resourceLinkId, sid }: Props) {
  const [result, setResult] = useState<null | { score: number; totalCorrect: number; total: number }>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers = quizItems.map((item) => ({
      quizId: item.quiz_id,
      chosenAnswer: parseAnswer(form.get(item.quiz_id)),
    }));

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withSid("/api/quiz/submit", sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, resourceLinkId, answers }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setResult(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {quizItems.map((item, index) => {
        const options = optionsOf(item);
        return (
          <fieldset key={item.quiz_id} className="rounded border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-slate-500">Câu {index + 1}</legend>
            <p className="mb-3 font-medium text-slate-950">{item.question}</p>
            <div className="space-y-2">
              {options.map((option, optionIndex) => (
                <label key={optionIndex} className="flex gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                  <input type="radio" name={item.quiz_id} value={JSON.stringify(option.value)} required />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      {message && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      {result && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          Điểm: {result.score}/100, đúng {result.totalCorrect}/{result.total}.
        </p>
      )}
      <button
        type="submit"
        disabled={busy || quizItems.length === 0}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Nộp bài
      </button>
    </form>
  );
}
