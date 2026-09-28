"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasQuizContext, ReviewQuiz } from "@/lib/canvas-quiz";
import type { ContentGenerationRequest } from "@/lib/quiz";
import { bloomLabel, isActiveRequest } from "@/lib/quiz";
import {
  DISCARDED,
  ghostButton,
  inputClass,
  KEPT,
  NEEDS_REVIEW,
  QuestionPicker,
} from "@/components/question-card";
import {
  DEFAULT_SETTINGS,
  QuizSettingsBar,
  SettingsInputs,
  settingsProblem,
  type QuizSettingsDraft,
} from "./quiz-settings";

type Notice = { kind: "info" | "success" | "error"; text: string } | null;
type Bloom = "auto" | number;


const shortTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const NOTICE_STYLE = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-800",
};

function endpoint(path: string, flowId: string, sid?: string, chapterId?: string) {
  const params = new URLSearchParams({ flow: flowId });
  if (sid) params.set("sid", sid);
  if (chapterId) params.set("chapterId", chapterId);
  return `${path}?${params}`;
}

function scopeField(scope: unknown, field: string) {
  return scope && typeof scope === "object" && field in scope
    ? String((scope as Record<string, unknown>)[field])
    : null;
}

// Header, padding và lề của modal Canvas quanh iframe.
const CANVAS_MODAL_CHROME = 190;

/**
 * Canvas đặt iframe cao cố định selection_height (800px) trong modal; màn hình
 * thấp hơn thì modal cuộn thêm một lớp ngoài iframe → hai thanh cuộn. Hỏi
 * kích thước cửa sổ Canvas rồi thu iframe vừa khung để chỉ iframe cuộn.
 */
function useFitCanvasModal() {
  useEffect(() => {
    if (window.parent === window) return;
    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.subject !== "lti.fetchWindowSize.response") return;
      const height = Number(event.data.height);
      if (!height) return;
      window.parent.postMessage(
        { subject: "lti.frameResize", height: Math.max(420, Math.min(800, height - CANVAS_MODAL_CHROME)) },
        "*",
      );
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ subject: "lti.fetchWindowSize" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);
}

function generationError(error: string) {
  if (error.includes("No grounded source chunks"))
    return "không tìm thấy đoạn slide nào gắn với LO này";
  return "không sinh được ở lần này";
}

export function QuizComposer({
  flowId,
  sid,
  initial,
}: {
  flowId: string;
  sid?: string;
  initial: CanvasQuizContext;
}) {
  useFitCanvasModal();
  const [data, setData] = useState(initial);
  const [chapterId, setChapterId] = useState(initial.chapter?.chapter_id || "");
  const [pickingChapter, setPickingChapter] = useState(!initial.chapter);
  const [loIds, setLoIds] = useState(initial.learningOutcomes.map((lo) => lo.lo_id));
  const [perLo, setPerLo] = useState(3);
  const [bloom, setBloom] = useState<Bloom>("auto");
  const [title, setTitle] = useState(`Quiz ${initial.module.name}`);
  const [settings, setSettings] = useState<QuizSettingsDraft>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showReuse, setShowReuse] = useState(false);
  // Yêu cầu đang chạy lúc mở / sau lần tải gần nhất — để biết đợt nào vừa xong.
  const runningIds = useRef<Set<string>>(
    new Set(initial.requests.filter((r) => isActiveRequest(r)).map((r) => r.request_id)),
  );

  const apiUrl = endpoint("/api/lti/deep-link", flowId, sid, chapterId);
  const returnUrl = endpoint("/lti/deep-link/return", flowId, sid);

  const chapterRequests = useMemo(
    () => data.requests.filter((r) => scopeField(r.scope, "chapter_id") === chapterId),
    [data.requests, chapterId],
  );
  const running = chapterRequests.filter((r) => isActiveRequest(r));
  // Yêu cầu mới nhất của từng LO (danh sách đã xếp mới → cũ).
  const latestByLo = useMemo(() => {
    const map = new Map<string, ContentGenerationRequest>();
    for (const r of chapterRequests) {
      const lo = scopeField(r.scope, "target_code");
      if (lo && !map.has(lo)) map.set(lo, r);
    }
    return map;
  }, [chapterRequests]);

  const inQuiz = data.quizItems.filter((q) => selected.includes(q.quiz_id));

  const refresh = useCallback(
    async (targetChapter = chapterId) => {
      const response = await fetch(endpoint("/api/lti/deep-link", flowId, sid, targetChapter), {
        cache: "no-store",
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Không tải được câu hỏi.");
      const context = next as CanvasQuizContext;
      setData(context);
      setSelected((ids) =>
        ids.filter((id) => context.quizItems.some((q) => q.quiz_id === id && KEPT.includes(q.status))),
      );

      // Báo khi một đợt sinh vừa xong, ngay đầu hộp thoại.
      const finished = context.requests.filter(
        (r) => runningIds.current.has(r.request_id) && !isActiveRequest(r),
      );
      if (finished.length) {
        const made = finished.reduce((sum, r) => sum + (r.generated_count || 0), 0);
        const failed = finished.filter((r) => r.status === "FAILED").length;
        setNotice(
          made
            ? { kind: "success", text: `Đã sinh ${made} câu mới. Bấm “Giữ” ở câu muốn đưa vào quiz.` }
            : { kind: "error", text: `Sinh thất bại ở ${failed} LO — xem lý do ngay dưới nút Sinh.` },
        );
      }
      runningIds.current = new Set(
        context.requests.filter((r) => isActiveRequest(r)).map((r) => r.request_id),
      );
      return context;
    },
    [chapterId, flowId, sid],
  );

  useEffect(() => {
    if (!running.length) return;
    const timer = window.setInterval(() => {
      refresh().catch((e: Error) => setNotice({ kind: "error", text: e.message }));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [running.length, refresh]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, chapterId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Thao tác thất bại.");
    return result;
  }

  async function withPending(ids: string[], work: () => Promise<void>) {
    setPending((current) => [...current, ...ids]);
    try {
      await work();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Không thể xử lý." });
    } finally {
      setPending((current) => current.filter((id) => !ids.includes(id)));
    }
  }

  async function generate() {
    setGenerating(true);
    setNotice(null);
    try {
      const result = await post({ action: "generate", targetIds: loIds, count: perLo, bloomLevel: bloom });
      for (const r of result.requests ?? []) runningIds.current.add(r.request_id);
      setNotice({
        kind: "info",
        text: `Đang sinh ${perLo * loIds.length} câu cho ${loIds.length} LO từ slide của chương. Câu mới sẽ hiện bên dưới.`,
      });
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Không sinh được." });
    } finally {
      setGenerating(false);
    }
  }

  function keep(quiz: ReviewQuiz) {
    if (KEPT.includes(quiz.status)) {
      setSelected((ids) => [...new Set([...ids, quiz.quiz_id])]);
      return;
    }
    return withPending([quiz.quiz_id], async () => {
      await post({ action: "approve", quizId: quiz.quiz_id });
      await refresh();
      setSelected((ids) => [...new Set([...ids, quiz.quiz_id])]);
    });
  }

  function keepMany(quizzes: ReviewQuiz[]) {
    const ids = quizzes.map((q) => q.quiz_id);
    return withPending(ids, async () => {
      await post({ action: "approveMany", quizIds: ids });
      await refresh();
      setSelected((current) => [...new Set([...current, ...ids])]);
      setNotice({ kind: "success", text: `Đã giữ ${ids.length} câu.` });
    });
  }

  /** Chọn nhiều câu: câu ngân hàng chọn ngay, câu mới duyệt rồi chọn. */
  function selectMany(quizzes: ReviewQuiz[]) {
    const bank = quizzes.filter((q) => KEPT.includes(q.status)).map((q) => q.quiz_id);
    setSelected((ids) => [...new Set([...ids, ...bank])]);
    const fresh = quizzes.filter((q) => NEEDS_REVIEW.includes(q.status));
    if (fresh.length) void keepMany(fresh);
  }

  function removeFromQuiz(quiz: ReviewQuiz) {
    setSelected((ids) => ids.filter((id) => id !== quiz.quiz_id));
  }

  function discard(quiz: ReviewQuiz) {
    return withPending([quiz.quiz_id], async () => {
      await post({ action: "reject", quizId: quiz.quiz_id });
      setSelected((ids) => ids.filter((id) => id !== quiz.quiz_id));
      await refresh();
    });
  }

  function save(quiz: ReviewQuiz, form: FormData) {
    return withPending([quiz.quiz_id], async () => {
      await post({
        action: "edit",
        quizId: quiz.quiz_id,
        question: form.get("question"),
        explanation: form.get("explanation"),
        options: [0, 1, 2, 3].map((i) => form.get(`option_${i}`)),
        correctIndex: Number(form.get("correctIndex")),
      });
      setSelected((ids) => ids.filter((id) => id !== quiz.quiz_id));
      await refresh();
      setNotice({ kind: "info", text: "Đã lưu. Bấm “Giữ” để duyệt lại câu vừa sửa." });
    });
  }

  async function changeChapter(id: string) {
    setGenerating(true);
    setNotice(null);
    try {
      const next = await refresh(id);
      setChapterId(next.chapter?.chapter_id || "");
      setLoIds(next.learningOutcomes.map((lo) => lo.lo_id));
      setSelected([]);
      setPickingChapter(false);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Không tải được chương." });
    } finally {
      setGenerating(false);
    }
  }

  const chapter = data.chapter;
  const canGenerate = Boolean(chapter && data.documents.length && loIds.length && !running.length && !generating);
  const generateBlocker = !data.documents.length
    ? "Chương chưa có slide đã xử lý — đồng bộ tài liệu Canvas và gắn đúng chương ở mục Tài liệu."
    : !loIds.length
      ? "Chọn ít nhất một LO."
      : null;
  const settingsError = settingsProblem(settings);
  const perLoCount = data.learningOutcomes
    .map((lo) => ({ code: lo.code, n: inQuiz.filter((q) => q.lo_id === lo.lo_id).length }))
    .filter((x) => x.n > 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">DA Platform · Quiz cho Canvas</p>
            <h1 className="mt-0.5 truncate text-lg font-semibold">
              {chapter ? `Quiz cho Chương ${chapter.code} · ${chapter.title}` : `Chọn chương cho “${data.module.name}”`}
            </h1>
            {chapter && !pickingChapter && (
              <p className="text-xs text-slate-500">
                Nhận từ module “{data.module.name}” ·{" "}
                <button type="button" className="text-sky-700 underline" onClick={() => setPickingChapter(true)}>
                  Đổi chương
                </button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={endpoint("/manage/quizzes/new", flowId, sid)}
              className="text-sm font-medium text-sky-700 underline"
              title="Soạn đề nhiều chương theo ma trận LO × Bloom ngay trong hộp thoại này, lưu xong thêm thẳng vào module"
            >
              Soạn đề nâng cao
            </a>
            <button
              type="button"
              className={ghostButton}
              onClick={() => {
                // Đề vừa soạn ở tab "Soạn đề nâng cao" chỉ hiện sau khi tải lại.
                if (!showReuse) refresh().catch((e: Error) => setNotice({ kind: "error", text: e.message }));
                setShowReuse((v) => !v);
              }}
            >
              Dùng lại quiz đã tạo ({data.quizSets.length})
            </button>
          </div>
        </div>
        {pickingChapter && (
          <div className="mx-auto mt-2 flex max-w-5xl items-center gap-2">
            <select
              className={inputClass}
              value={chapterId}
              disabled={generating}
              onChange={(e) => void changeChapter(e.target.value)}
              aria-label="Chương trong đề cương"
            >
              <option value="" disabled>
                Chọn chương tương ứng với module này…
              </option>
              {data.chapters.map((c) => (
                <option key={c.chapter_id} value={c.chapter_id}>
                  Chương {c.code} — {c.title}
                </option>
              ))}
            </select>
            {chapter && (
              <button type="button" className={ghostButton} onClick={() => setPickingChapter(false)}>
                Đóng
              </button>
            )}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className={`mx-auto mt-2 flex max-w-5xl items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${NOTICE_STYLE[notice.kind]}`}
          >
            <span>{notice.text}</span>
            <button type="button" aria-label="Đóng thông báo" className="opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}
      </header>

      <div className={`mx-auto max-w-5xl space-y-4 p-5 ${settings.mode === "exam" ? "pb-80" : "pb-40"}`}>
        {showReuse && !data.quizSets.length && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            Chưa có đề nào được lưu. Soạn ở bên dưới, hoặc dùng “Soạn đề nâng cao” cho đề nhiều chương.
          </p>
        )}
        {showReuse && data.quizSets.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">Đề đã lưu của khóa học</h2>
            <div className="mt-2 divide-y divide-slate-200">
              {data.quizSets.map((set) => (
                <form key={set.quiz_set_id} action={returnUrl} method="post" className="flex items-center justify-between gap-3 py-2">
                  <input type="hidden" name="chapterId" value={chapterId} />
                  <input type="hidden" name="quizSetId" value={set.quiz_set_id} />
                  <span className="text-sm">
                    {set.title} · {set.questionCount} câu ·{" "}
                    {set.chapterCodes.length ? `Chương ${set.chapterCodes.join(", ")} · ` : ""}
                    {set.settings.mode === "exam"
                      ? `Kiểm tra${set.settings.dueAt ? `, hạn ${shortTime.format(new Date(set.settings.dueAt))}` : ""}`
                      : "Luyện tập"}
                  </span>
                  <button className={ghostButton}>Thêm vào module</button>
                </form>
              ))}
            </div>
          </section>
        )}

        {!data.chapters.length && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Khóa học chưa có đề cương. Mở DA Platform → Đề cương → Đồng bộ từ Canvas trước.
          </p>
        )}

        {chapter && (
          <>
            <section className="rounded-xl border border-sky-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Sinh câu hỏi từ slide của chương</h2>
                <p className="text-xs text-slate-500">
                  {data.documents.length
                    ? `Dựa trên: ${data.documents.map((d) => d.title).slice(0, 2).join(", ")}${data.documents.length > 2 ? ` +${data.documents.length - 2}` : ""}`
                    : "Chưa có slide"}
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="Chuẩn đầu ra">
                {data.learningOutcomes.map((lo) => {
                  const on = loIds.includes(lo.lo_id);
                  return (
                    <button
                      key={lo.lo_id}
                      type="button"
                      aria-pressed={on}
                      title={lo.statement_vi}
                      onClick={() => setLoIds((ids) => (on ? ids.filter((x) => x !== lo.lo_id) : [...ids, lo.lo_id]))}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm ${on ? "border-sky-600 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-500"}`}
                    >
                      <span aria-hidden>{on ? "✓" : "+"}</span>
                      <span className="font-semibold">{lo.code}</span>
                      <span className="line-clamp-2">{lo.statement_vi}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Số câu mỗi LO
                  <input
                    className={`${inputClass} w-24`}
                    type="number"
                    min={1}
                    max={10}
                    value={perLo}
                    onChange={(e) => setPerLo(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Mức Bloom
                  <select
                    className={`${inputClass} w-48`}
                    value={String(bloom)}
                    onChange={(e) => setBloom(e.target.value === "auto" ? "auto" : Number(e.target.value))}
                  >
                    <option value="auto">Theo từng LO (đề xuất)</option>
                    {[1, 2, 3, 4, 5, 6].map((level) => (
                      <option key={level} value={level}>
                        {bloomLabel(level)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!canGenerate}
                  onClick={() => void generate()}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
                >
                  {running.length || generating ? "Đang sinh…" : `Sinh ${perLo * loIds.length} câu`}
                </button>
              </div>
              {generateBlocker && <p className="mt-2 text-sm text-amber-800">{generateBlocker}</p>}

              {latestByLo.size > 0 && (
                <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
                  {data.learningOutcomes
                    .filter((lo) => latestByLo.has(lo.lo_id))
                    .map((lo) => {
                      const r = latestByLo.get(lo.lo_id)!;
                      const active = isActiveRequest(r);
                      return (
                        <li key={lo.lo_id} className="flex items-center gap-2">
                          <span className="w-16 font-medium">{lo.code}</span>
                          {active ? (
                            <span className="flex items-center gap-2 text-sky-800">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-hidden />
                              Đang sinh…
                            </span>
                          ) : r.status === "FAILED" && r.generated_count > 0 ? (
                            <span className="text-amber-800">⚠ Sinh được {r.generated_count} câu rồi lỗi — xem tab Câu mới</span>
                          ) : r.status === "FAILED" ? (
                            <span className="text-red-700">✕ Lần sinh gần nhất lỗi: {generationError(r.last_error || "")}</span>
                          ) : (
                            <span className="text-emerald-800">✓ Lần sinh gần nhất: {r.generated_count} câu</span>
                          )}
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">
                Chọn câu hỏi cho quiz{" "}
                <span className="font-normal text-slate-500">
                  ({data.quizItems.filter((q) => q.status !== DISCARDED).length} câu của chương)
                </span>
              </h2>
              <QuestionPicker
                items={data.quizItems}
                loOptions={data.learningOutcomes}
                selected={selected}
                pending={pending}
                onToggle={(q, on) => (on ? void keep(q) : removeFromQuiz(q))}
                onSelectMany={selectMany}
                onClear={() => setSelected([])}
                onDiscard={(q) => void discard(q)}
                onRestore={(q) => void keep(q)}
                onSave={(q, form) => save(q, form)}
                emptyHint={`Chưa có câu mới. Bấm “Sinh ${perLo * loIds.length} câu” ở trên, hoặc chọn câu cũ ở tab Ngân hàng.`}
              />
            </section>
          </>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-5 py-3 shadow-lg">
        <div className="mx-auto mb-2 max-w-5xl border-b border-slate-100 pb-2">
          <QuizSettingsBar value={settings} onChange={setSettings} problem={settingsError} />
        </div>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {inQuiz.length ? (
              <>
                <p className="font-semibold">Quiz gồm {inQuiz.length} câu</p>
                <p className="truncate text-xs text-slate-500">{perLoCount.map((x) => `${x.code}: ${x.n}`).join(" · ")}</p>
              </>
            ) : (
              <p className="text-slate-500">Tick các câu muốn đưa vào quiz (tab Câu mới hoặc Ngân hàng).</p>
            )}
            {/* Canvas luôn tạo bài tập Deep Linking ở trạng thái unpublished và
                từ chối ghi điểm cho tới khi được publish. */}
            <p className="mt-0.5 truncate text-xs text-amber-700" title="Canvas tạo bài tập ở trạng thái chưa publish; sinh viên chỉ thấy bài và điểm chỉ vào sổ sau khi bấm Publish trong module.">
              Canvas tạo bài ở trạng thái chưa publish — nhớ bấm Publish trong module.
            </p>
          </div>
          <form action={returnUrl} method="post" className="flex shrink-0 items-center gap-2">
            <input type="hidden" name="chapterId" value={chapterId} />
            <input type="hidden" name="quizIds" value={JSON.stringify(selected)} />
            <SettingsInputs value={settings} />
            <input
              name="title"
              aria-label="Tên bài tập trên Canvas"
              className={`${inputClass.replace("w-full ", "")} w-72`}
              maxLength={255}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button
              disabled={!selected.length || !chapterId || !title.trim() || Boolean(settingsError)}
              className="whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-500"
            >
              {selected.length
                ? `Thêm ${settings.mode === "exam" ? "bài kiểm tra" : `${selected.length} câu`} vào module`
                : "Thêm vào module"}
            </button>
          </form>
          <form action={returnUrl} method="post">
            <input type="hidden" name="cancel" value="true" />
            <button className={ghostButton}>Hủy</button>
          </form>
        </div>
      </footer>
    </main>
  );
}
