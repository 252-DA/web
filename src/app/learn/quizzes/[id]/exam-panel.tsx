"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamSession, LearnerQuizResults, QuizSetSettings } from "@/lib/canvas-quiz";
import { answerKey, quizChoices } from "@/lib/quiz";

type Result = {
  score: number;
  bestScore?: number;
  attemptCount?: number;
  totalCorrect: number;
  total: number;
  revealAt: string | null;
};

const time = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function withSid(path: string, sid?: string) {
  return sid ? `${path}?sid=${encodeURIComponent(sid)}` : path;
}

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Lưu tạm câu trả lời trên máy để tải lại trang không mất bài; server vẫn là
// nơi quyết định giờ nộp. Storage có thể bị chặn trong iframe nên luôn try/catch.
function loadDraft(sessionId: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(`da-exam:${sessionId}`) || "{}");
  } catch {
    return {};
  }
}
function saveDraft(sessionId: string, answers: Record<string, unknown>) {
  try {
    localStorage.setItem(`da-exam:${sessionId}`, JSON.stringify(answers));
  } catch {}
}
function clearDraft(sessionId: string) {
  try {
    localStorage.removeItem(`da-exam:${sessionId}`);
  } catch {}
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Lỗi HTTP ${response.status}`);
  return payload as T;
}

export function ExamPanel({
  quizSetId,
  resourceLinkId,
  sid,
  questionCount,
  settings,
  state,
}: {
  quizSetId: string;
  resourceLinkId?: string | null;
  sid?: string;
  questionCount: number;
  settings: QuizSetSettings;
  state: LearnerQuizResults | null;
}) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const submitted = useRef(false);

  const used = state?.attemptsUsed ?? 0;
  const left = settings.maxAttempts === null ? null : Math.max(0, settings.maxAttempts - used);
  const resumable = Boolean(state?.openSession);
  const canStart = state?.window === "open" && (resumable || left === null || left > 0);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const next = await postJson<ExamSession>(withSid("/api/quiz/start", sid), { quizSetId });
      setSkew(new Date(next.serverNow).getTime() - Date.now());
      setAnswers(loadDraft(next.sessionId));
      setSession(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bắt đầu được bài kiểm tra.");
    } finally {
      setBusy(false);
    }
  }

  const submit = useCallback(async () => {
    if (!session || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await postJson<Result>(withSid("/api/quiz/submit", sid), {
        quizSetId,
        resourceLinkId,
        sessionId: session.sessionId,
        answers: Object.entries(answers).map(([quizId, chosenAnswer]) => ({ quizId, chosenAnswer })),
      });
      clearDraft(session.sessionId);
      setResult(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      submitted.current = false;
      setError(e instanceof Error ? e.message : "Không nộp được bài.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [answers, quizSetId, resourceLinkId, session, sid]);

  const remaining = session?.expiresAt
    ? new Date(session.expiresAt).getTime() - (now + skew)
    : null;

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Đồng hồ đếm ngược; hết giờ thì tự nộp những câu đã làm.
  useEffect(() => {
    if (!session || result) return;
    const expires = session.expiresAt ? new Date(session.expiresAt).getTime() : null;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (expires !== null && expires - (t + skew) <= 0) void submitRef.current();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session, result, skew]);

  if (result) {
    const points = Math.round(result.score * settings.pointsPossible) / 100;
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-900 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">Đã nộp bài</p>
          <p className="mt-2 text-4xl font-bold tabular-nums">
            {points}/{settings.pointsPossible}
          </p>
          <p className="mt-1 text-sm">
            Đúng {result.totalCorrect}/{result.total} câu
            {(result.attemptCount ?? 1) > 1 && result.bestScore !== undefined &&
              ` · Canvas ghi điểm cao nhất: ${Math.round(result.bestScore * settings.pointsPossible) / 100}/${settings.pointsPossible}`}
          </p>
        </div>
        <p className="p-4 text-sm text-slate-600">
          {result.revealAt
            ? `Đáp án và giải thích sẽ hiện ở trang này sau ${time.format(new Date(result.revealAt))}.`
            : "Điểm đã được xếp hàng gửi về sổ điểm Canvas."}
        </p>
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Về trang bài kiểm tra
          </button>
        </div>
      </section>
    );
  }

  if (session) {
    const unanswered = session.items.filter((i) => !Object.hasOwn(answers, i.quiz_id)).length;
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
          <span className="text-sm text-slate-600">
            Lần {session.attemptNumber}
            {session.maxAttempts ? `/${session.maxAttempts}` : ""} · Đã trả lời{" "}
            {session.items.length - unanswered}/{session.items.length}
          </span>
          {remaining !== null && (
            <span
              className={`rounded-lg px-3 py-1 font-mono text-lg font-semibold tabular-nums ${remaining < 60_000 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-900"}`}
              aria-live="polite"
            >
              {clock(remaining)}
            </span>
          )}
        </div>

        {session.items.map((item, index) => (
          <fieldset key={item.quiz_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="sr-only">Câu {index + 1}</legend>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Câu {index + 1}</p>
            <p className="mt-2 font-semibold leading-7">{item.question}</p>
            <div className="mt-3 grid gap-2">
              {quizChoices(item.options).map((choice, i) => {
                const selected = answerKey(answers[item.quiz_id]) === answerKey(choice.value);
                return (
                  <label
                    key={`${choice.key}-${i}`}
                    className={
                      selected
                        ? "flex cursor-pointer gap-3 rounded-xl border border-sky-500 bg-sky-50 p-3 text-sm text-sky-950 ring-2 ring-sky-100"
                        : "flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:border-slate-400"
                    }
                  >
                    <input
                      type="radio"
                      name={item.quiz_id}
                      checked={selected}
                      onChange={() =>
                        setAnswers((prev) => {
                          const next = { ...prev, [item.quiz_id]: choice.value };
                          saveDraft(session.sessionId, next);
                          return next;
                        })
                      }
                      className="mt-0.5"
                    />
                    <span className="font-semibold text-slate-400">{String.fromCharCode(65 + i)}</span>
                    <span>{choice.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {confirming ? (
            <>
              <span className="text-sm text-amber-800">Còn {unanswered} câu chưa trả lời, câu bỏ trống tính sai.</span>
              <button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setConfirming(false)}>
                Làm tiếp
              </button>
              <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
                Vẫn nộp
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => (unanswered ? setConfirming(true) : void submit())}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Đang nộp…" : "Nộp bài"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const blocked =
    state?.window === "not_open"
      ? `Bài kiểm tra mở lúc ${settings.availableFrom ? time.format(new Date(settings.availableFrom)) : ""}.`
      : state?.window === "closed"
        ? "Bài kiểm tra đã đóng."
        : left === 0 && !resumable
          ? "Bạn đã dùng hết số lần làm bài."
          : null;
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["Số câu", `${questionCount} câu`],
          ["Thời gian", settings.timeLimitMinutes ? `${settings.timeLimitMinutes} phút, tính từ lúc bắt đầu` : "Không giới hạn"],
          ["Số lần làm", settings.maxAttempts ? `Đã dùng ${used}/${settings.maxAttempts}` : `Không giới hạn (đã làm ${used})`],
          ["Điểm tối đa", `${settings.pointsPossible} điểm`],
          ["Hạn nộp", settings.dueAt ? time.format(new Date(settings.dueAt)) : "—"],
          ["Đóng bài", settings.availableUntil ? time.format(new Date(settings.availableUntil)) : "Theo hạn nộp"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Bấm bắt đầu là đã dùng một lượt; hết giờ bài tự nộp những câu đã làm.</li>
        <li>Đáp án và giải thích chỉ hiện sau khi bài đóng.</li>
        {(settings.maxAttempts ?? 2) > 1 && <li>Canvas ghi điểm cao nhất trong các lần làm.</li>}
      </ul>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {blocked ? (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{blocked}</p>
      ) : (
        <button
          type="button"
          disabled={busy || !canStart}
          onClick={() => void start()}
          className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Đang mở đề…" : resumable ? "Tiếp tục làm bài" : "Bắt đầu làm bài"}
        </button>
      )}
    </section>
  );
}
