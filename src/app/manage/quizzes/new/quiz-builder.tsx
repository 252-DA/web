"use client";

import { useEffect, useRef, useState } from "react";
import type { QuizBuilderContext, ReviewQuiz } from "@/lib/canvas-quiz";
import { bloomLabel, isActiveRequest, type ContentGenerationRequest } from "@/lib/quiz";
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
  settingsPayload,
  settingsProblem,
  type QuizSettingsDraft,
} from "@/app/lti/deep-link/quiz-settings";

type Data = QuizBuilderContext & { requests: ContentGenerationRequest[] };
type Notice = { kind: "info" | "success" | "error"; text: string } | null;
type Lo = QuizBuilderContext["chapters"][number]["learningOutcomes"][number];

const LEVELS = [1, 2, 3, 4, 5, 6];
const BLOOM_NAMES = ["", "remember", "understand", "apply", "analyze", "evaluate", "create"];
const MAX_PER_CELL = 20;
const MAX_TOTAL = 100;

const NOTICE_STYLE = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-800",
};

const cellKey = (loId: string, level: number) => `${loId}:${level}`;

function scopeOf(r: ContentGenerationRequest) {
  return (r.scope && typeof r.scope === "object" ? r.scope : {}) as Record<string, unknown>;
}

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * Gửi đề đã lưu về Canvas qua Deep Linking (cùng route với hộp thoại module):
 * route trả form tự nộp JWT, Canvas tạo bài tập trong module và đóng hộp thoại.
 */
function addToModule(flow: string, sid: string | undefined, quizSetId: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = withSid(`/lti/deep-link/return?flow=${encodeURIComponent(flow)}`, sid);
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "quizSetId";
  input.value = quizSetId;
  form.append(input);
  document.body.append(form);
  form.submit();
}

function Section({ step, title, children, aside }: { step: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          <span className="mr-2 text-slate-400">{step}.</span>
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function QuizBuilder({ sid, flow, initial }: { sid?: string; flow?: string; initial: Data }) {
  const [data, setData] = useState(initial);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [docsTouched, setDocsTouched] = useState(false);
  const [levels, setLevels] = useState<number[]>([1, 2, 3]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  const [quick, setQuick] = useState<Record<number, number>>({ 1: 2, 2: 2, 3: 1 });
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [settings, setSettings] = useState<QuizSettingsDraft>(DEFAULT_SETTINGS);
  const [selectionId, setSelectionId] = useState(() => crypto.randomUUID());
  const runningIds = useRef<Set<string>>(
    new Set(initial.requests.filter((r) => isActiveRequest(r)).map((r) => r.request_id)),
  );

  const api = withSid("/api/quiz-builder", sid);
  const chapters = data.chapters.filter((c) => chapterIds.includes(c.chapter_id));
  const chapterCodes = new Set(chapters.map((c) => c.code));
  // Một LO có thể thuộc nhiều chương: gom theo chương nhưng mỗi LO chỉ một dòng.
  const seenLos = new Set<string>();
  const groups = chapters.map((c) => ({
    chapter: c,
    los: c.learningOutcomes.filter((lo) => (seenLos.has(lo.lo_id) ? false : (seenLos.add(lo.lo_id), true))),
  }));
  const los: Lo[] = groups.flatMap((g) => g.los);
  const loIds = los.map((lo) => lo.lo_id);
  const loById = new Map(los.map((lo) => [lo.lo_id, lo]));
  const activeLos = los.filter((lo) => !excluded.includes(lo.lo_id));

  const cells = activeLos.flatMap((lo) =>
    levels.flatMap((level) => {
      const count = matrix[cellKey(lo.lo_id, level)] ?? 0;
      return count > 0 ? [{ lo_id: lo.lo_id, bloom_level: level, count }] : [];
    }),
  );
  const total = cells.reduce((sum, c) => sum + c.count, 0);

  const lectureDocs = data.documents.filter((d) => d.role === "lecture" && d.chapter_code && chapterCodes.has(d.chapter_code));
  const referenceDocs = data.documents.filter((d) => d.role === "reference");
  const otherDocs = data.documents.filter((d) => !lectureDocs.includes(d) && !referenceDocs.includes(d));
  const chosenDocs = data.documents.filter((d) => docIds.includes(d.document_id));
  const running = data.requests.filter((r) => isActiveRequest(r));

  async function refresh(ids: string[] = loIds) {
    const url = new URL(api, window.location.origin);
    url.searchParams.set("loIds", ids.join(","));
    const response = await fetch(url, { cache: "no-store" });
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || "Không tải được dữ liệu.");
    const ctx = next as Data;
    setData(ctx);
    setSelected((current) =>
      current.filter((id) => ctx.quizItems.some((q) => q.quiz_id === id && KEPT.includes(q.status))),
    );
    const finished = ctx.requests.filter((r) => runningIds.current.has(r.request_id) && !isActiveRequest(r));
    if (finished.length) {
      const made = finished.reduce((sum, r) => sum + (r.generated_count || 0), 0);
      const failed = finished.filter((r) => r.status === "FAILED").length;
      setNotice(
        made
          ? { kind: "success", text: `Đã sinh ${made} câu mới${failed ? `, ${failed} ô lỗi` : ""}. Duyệt ở mục 5.` }
          : { kind: "error", text: `Sinh thất bại ở ${failed} ô — xem lý do ở mục 4.` },
      );
    }
    runningIds.current = new Set(ctx.requests.filter((r) => isActiveRequest(r)).map((r) => r.request_id));
    return ctx;
  }

  // Bộ hẹn giờ luôn gọi bản refresh mới nhất (LO đổi theo chương đang chọn).
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    if (!running.length) return;
    const timer = window.setInterval(() => {
      refreshRef.current().catch((e: Error) => setNotice({ kind: "error", text: e.message }));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [running.length]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, loIds }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Thao tác thất bại.");
    return result;
  }

  function toggleChapter(id: string) {
    const next = chapterIds.includes(id) ? chapterIds.filter((c) => c !== id) : [...chapterIds, id];
    setChapterIds(next);
    const codes = new Set(data.chapters.filter((c) => next.includes(c.chapter_id)).map((c) => c.code));
    // Mặc định lấy slide đã xử lý của các chương đã chọn, cho tới khi giảng viên tự chỉnh.
    if (!docsTouched)
      setDocIds(
        data.documents
          .filter((d) => d.role === "lecture" && d.ready && d.chapter_code && codes.has(d.chapter_code))
          .map((d) => d.document_id),
      );
    // Tên tự đặt theo các chương đã chọn cho tới khi giảng viên tự sửa.
    if (!titleTouched) {
      const codes = data.chapters.filter((c) => next.includes(c.chapter_id)).map((c) => c.code);
      setTitle(codes.length ? `Đề Chương ${codes.join(", ")}` : "");
    }
    const ids = data.chapters.filter((c) => next.includes(c.chapter_id)).flatMap((c) => c.learningOutcomes.map((lo) => lo.lo_id));
    refresh(ids).catch((e: Error) => setNotice({ kind: "error", text: e.message }));
  }

  function toggleDoc(id: string) {
    setDocsTouched(true);
    setDocIds((current) => (current.includes(id) ? current.filter((d) => d !== id) : [...current, id]));
  }

  function setCell(loId: string, level: number, value: string) {
    const n = Math.max(0, Math.min(MAX_PER_CELL, Math.trunc(Number(value) || 0)));
    setMatrix((m) => ({ ...m, [cellKey(loId, level)]: n }));
  }

  function applyQuick() {
    setMatrix((m) => {
      const next = { ...m };
      for (const lo of activeLos) for (const level of levels) next[cellKey(lo.lo_id, level)] = quick[level] ?? 0;
      return next;
    });
  }

  /** Mỗi LO một câu ở đúng mức Bloom ghi trong đề cương (nếu mức đó đang bật). */
  function fillFromSyllabus() {
    setMatrix((m) => {
      const next = { ...m };
      for (const lo of activeLos)
        for (const level of levels) next[cellKey(lo.lo_id, level)] = lo.bloom_level === level ? 2 : 0;
      return next;
    });
  }

  async function generate() {
    setGenerating(true);
    setNotice(null);
    try {
      const result = await post({ action: "generate", cells, documentIds: docIds });
      for (const r of result.requests ?? []) runningIds.current.add(r.request_id);
      setNotice({ kind: "info", text: `Đang sinh ${total} câu cho ${cells.length} ô của ma trận. Câu mới hiện ở mục 5.` });
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Không sinh được." });
    } finally {
      setGenerating(false);
    }
  }

  async function withPending(ids: string[], work: () => Promise<void>) {
    setPending((c) => [...c, ...ids]);
    try {
      await work();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Không thể xử lý." });
    } finally {
      setPending((c) => c.filter((id) => !ids.includes(id)));
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

  /** Chọn nhiều câu: câu ngân hàng chọn ngay, câu mới duyệt rồi chọn. */
  function selectMany(quizzes: ReviewQuiz[]) {
    const bank = quizzes.filter((q) => KEPT.includes(q.status)).map((q) => q.quiz_id);
    setSelected((ids) => [...new Set([...ids, ...bank])]);
    const fresh = quizzes.filter((q) => NEEDS_REVIEW.includes(q.status));
    if (fresh.length) void keepMany(fresh);
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

  function discard(quiz: ReviewQuiz) {
    return withPending([quiz.quiz_id], async () => {
      await post({ action: "reject", quizId: quiz.quiz_id });
      setSelected((ids) => ids.filter((id) => id !== quiz.quiz_id));
      await refresh();
    });
  }

  function saveEdit(quiz: ReviewQuiz, form: FormData) {
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

  async function saveSet() {
    setSaving(true);
    setNotice(null);
    try {
      const saved = await post({
        action: "save",
        chapterIds,
        title: title.trim(),
        quizIds: selected,
        selectionId,
        settings: settingsPayload(settings),
        blueprint: { cells, source_document_ids: docIds },
      });
      if (flow) {
        setNotice({ kind: "info", text: `Đã lưu “${saved.title}”. Đang thêm vào module…` });
        addToModule(flow, sid, saved.quiz_set_id);
        return;
      }
      setNotice({
        kind: "success",
        text: `Đã lưu “${saved.title}” (${saved.questionCount} câu). Trong Canvas: menu ⋮ của module → Sinh quiz bằng DA → Dùng lại quiz đã tạo.`,
      });
      setSelectionId(crypto.randomUUID());
      setSelected([]);
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Không lưu được đề." });
    } finally {
      setSaving(false);
    }
  }

  // ----- dữ liệu cho phần duyệt câu -----
  const inScope = data.quizItems.filter((q) => q.lo_id && loById.has(q.lo_id));
  const inSet = data.quizItems.filter((q) => selected.includes(q.quiz_id));
  const coverage = cells.map((c) => ({
    ...c,
    picked: inSet.filter((q) => q.lo_id === c.lo_id && q.bloom_level === c.bloom_level).length,
  }));
  const short = coverage.reduce((sum, c) => sum + Math.max(0, c.count - c.picked), 0);

  // Tiến độ: yêu cầu mới nhất của từng ô.
  const latestByCell = new Map<string, ContentGenerationRequest>();
  for (const r of data.requests) {
    const s = scopeOf(r);
    const level = BLOOM_NAMES.indexOf(String(s.bloom_level));
    const key = cellKey(String(s.target_code), level);
    if (loById.has(String(s.target_code)) && !latestByCell.has(key)) latestByCell.set(key, r);
  }

  const settingsError = settingsProblem(settings);
  const lectureChosen = chosenDocs.some((d) => d.role === "lecture");
  const generateBlocker = !chapterIds.length
    ? "Chọn ít nhất một chương."
    : !lectureChosen
      ? "Chọn ít nhất một slide bài giảng đã xử lý."
      : !total
        ? "Điền số câu vào ma trận."
        : total > MAX_TOTAL
          ? `Tối đa ${MAX_TOTAL} câu mỗi lần sinh.`
          : cells.length > 60
            ? "Tối đa 60 ô mỗi lần sinh."
            : running.length
              ? "Đợt sinh trước đang chạy."
              : null;
  const saveBlocker = !chapterIds.length
    ? "Chọn chương"
    : !selected.length
      ? "Bấm “Giữ” ở các câu muốn đưa vào đề"
      : !title.trim()
        ? "Đặt tên đề"
        : settingsError;

  return (
    <div className={`mx-auto max-w-6xl space-y-4 p-4 ${settings.mode === "exam" ? "pb-80" : "pb-48"}`}>
      {notice && (
        <div role="status" className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${NOTICE_STYLE[notice.kind]}`}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Đóng thông báo" className="opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      <Section
        step={1}
        title="Phạm vi đề"
        aside={<span className="text-xs text-slate-500">{chapterIds.length ? `${chapterIds.length} chương · ${los.length} LO` : "Chọn nhiều chương cho đề giữa kỳ/cuối kỳ"}</span>}
      >
        {!data.chapters.length ? (
          <p className="text-sm text-amber-800">Khóa học chưa có đề cương. Vào mục Đề cương để đồng bộ trước.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.chapters.map((c) => {
              const on = chapterIds.includes(c.chapter_id);
              return (
                <button
                  key={c.chapter_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleChapter(c.chapter_id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-sky-600 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"}`}
                >
                  {on ? "✓ " : ""}Chương {c.code}
                  <span className="ml-1 text-xs text-slate-500">· {c.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {chapterIds.length > 0 && (
        <Section
          step={2}
          title="Tài liệu nguồn"
          aside={<span className="text-xs text-slate-500">Đã chọn {chosenDocs.length} tài liệu</span>}
        >
          <DocList title="Slide bài giảng của các chương đã chọn" docs={lectureDocs} chosen={docIds} onToggle={toggleDoc} empty="Chưa có slide nào gắn với các chương này — đồng bộ tài liệu Canvas ở mục Documents." />
          <DocList title="Tài liệu tham khảo (chỉ làm ngữ cảnh bổ sung)" docs={referenceDocs} chosen={docIds} onToggle={toggleDoc} />
          {otherDocs.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">Slide của chương khác ({otherDocs.length})</summary>
              <DocList docs={otherDocs} chosen={docIds} onToggle={toggleDoc} />
            </details>
          )}
        </Section>
      )}

      {chapterIds.length > 0 && (
        <Section
          step={3}
          title="Ma trận đề: số câu cho từng LO ở từng mức"
          aside={<span className="text-sm font-semibold tabular-nums">Tổng {total} câu</span>}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-slate-500">Mức Bloom:</span>
            {LEVELS.map((level) => {
              const on = levels.includes(level);
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLevels((ls) => (on ? ls.filter((l) => l !== level) : [...ls, level].sort()))}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600"}`}
                >
                  {bloomLabel(level)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            <span>Điền nhanh mỗi LO:</span>
            {levels.map((level) => (
              <label key={level} className="flex items-center gap-1">
                {bloomLabel(level)}
                <input
                  type="number"
                  min={0}
                  max={MAX_PER_CELL}
                  value={quick[level] ?? 0}
                  onChange={(e) => setQuick((q) => ({ ...q, [level]: Math.max(0, Math.min(MAX_PER_CELL, Number(e.target.value) || 0)) }))}
                  className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center"
                />
              </label>
            ))}
            <button type="button" className={ghostButton} onClick={applyQuick}>
              Áp dụng
            </button>
            <button type="button" className={ghostButton} onClick={fillFromSyllabus} title="Mỗi LO 2 câu ở đúng mức Bloom ghi trong đề cương">
              Theo mức Bloom của đề cương
            </button>
            <button type="button" className="text-slate-500 underline" onClick={() => setMatrix({})}>
              Xoá ma trận
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-2 text-left font-medium">Chuẩn đầu ra</th>
                  {levels.map((level) => (
                    <th key={level} className="w-20 px-1 py-2 text-center font-medium">
                      {bloomLabel(level)}
                    </th>
                  ))}
                  <th className="w-14 py-2 text-right font-medium">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ chapter, los: rows }) => (
                  <MatrixGroup
                    key={chapter.chapter_id}
                    label={`Chương ${chapter.code} · ${chapter.title}`}
                    los={rows}
                    levels={levels}
                    matrix={matrix}
                    excluded={excluded}
                    onToggle={(id) => setExcluded((ex) => (ex.includes(id) ? ex.filter((x) => x !== id) : [...ex, id]))}
                    onCell={setCell}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-xs font-semibold">
                  <td className="py-2">Tổng</td>
                  {levels.map((level) => (
                    <td key={level} className="text-center tabular-nums">
                      {cells.filter((c) => c.bloom_level === level).reduce((s, c) => s + c.count, 0)}
                    </td>
                  ))}
                  <td className="text-right tabular-nums">{total}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={Boolean(generateBlocker) || generating}
              onClick={() => void generate()}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
            >
              {generating || running.length ? "Đang sinh…" : `Sinh ${total} câu`}
            </button>
            {generateBlocker && <span className="text-sm text-amber-800">{generateBlocker}</span>}
          </div>
        </Section>
      )}

      {latestByCell.size > 0 && (
        <Section step={4} title="Tiến độ sinh câu">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {[...latestByCell.entries()].map(([key, r]) => {
              const s = scopeOf(r);
              const lo = loById.get(String(s.target_code));
              const level = BLOOM_NAMES.indexOf(String(s.bloom_level));
              return (
                <li key={key} className="flex items-center gap-2">
                  <span className="w-40 truncate font-medium">
                    {lo?.code} · {bloomLabel(level)}
                  </span>
                  {isActiveRequest(r) ? (
                    <span className="flex items-center gap-2 text-sky-800">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-hidden />
                      Đang sinh {String(s.count ?? "")} câu…
                    </span>
                  ) : r.status === "FAILED" && r.generated_count > 0 ? (
                    <span className="truncate text-amber-800" title={r.last_error || ""}>
                      ⚠ Sinh được {r.generated_count}/{String(s.count ?? "?")} câu rồi lỗi — xem tab Câu mới
                    </span>
                  ) : r.status === "FAILED" ? (
                    <span className="truncate text-red-700" title={r.last_error || ""}>
                      ✕ {r.last_error?.includes("No grounded source chunks") ? "không tìm thấy đoạn tài liệu gắn với LO này" : "không sinh được"}
                    </span>
                  ) : (
                    <span className="text-emerald-800">✓ {r.generated_count} câu</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {chapterIds.length > 0 && (
        <Section
          step={5}
          title="Chọn câu hỏi cho đề"
          aside={
            <span className="text-xs text-slate-500">
              {inScope.filter((q) => q.status !== DISCARDED).length} câu trong phạm vi · đã chọn {selected.length}
            </span>
          }
        >
          {coverage.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
              <span className="text-slate-500">Đối chiếu ma trận:</span>
              {coverage.map((c) => (
                <span
                  key={cellKey(c.lo_id, c.bloom_level)}
                  className={`rounded px-2 py-0.5 tabular-nums ${c.picked >= c.count ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
                >
                  {loById.get(c.lo_id)?.code} · {bloomLabel(c.bloom_level)}: {c.picked}/{c.count}
                </span>
              ))}
            </div>
          )}
          <QuestionPicker
            items={inScope}
            loOptions={los}
            selected={selected}
            pending={pending}
            onToggle={(q, on) => (on ? void keep(q) : setSelected((ids) => ids.filter((id) => id !== q.quiz_id)))}
            onSelectMany={selectMany}
            onClear={() => setSelected([])}
            onDiscard={(q) => void discard(q)}
            onRestore={(q) => void keep(q)}
            onSave={(q, form) => saveEdit(q, form)}
            emptyHint="Chưa có câu mới. Điền ma trận ở mục 3 rồi bấm Sinh, hoặc chọn câu cũ ở tab Ngân hàng."
          />
        </Section>
      )}

      {data.quizSets.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Đề đã lưu ({data.quizSets.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {data.quizSets.map((s) => (
              <li key={s.quiz_set_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{s.title}</span>
                <span className="flex items-center gap-3 text-xs text-slate-500">
                  {s.questionCount} câu · {s.chapterCodes.length ? `Chương ${s.chapterCodes.join(", ")}` : "—"} ·{" "}
                  {s.settings.mode === "exam" ? "Kiểm tra" : "Luyện tập"}
                  {flow && (
                    <button type="button" className={ghostButton} onClick={() => addToModule(flow, sid, s.quiz_set_id)}>
                      Thêm vào module
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3 shadow-lg">
        <div className="mx-auto max-w-6xl space-y-2">
          <QuizSettingsBar value={settings} onChange={setSettings} problem={settingsError} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                Đề gồm {selected.length} câu{chapterIds.length > 1 ? ` · ${chapterIds.length} chương` : ""}
              </p>
              <p className="truncate text-xs text-slate-500">
                {!cells.length
                  ? "Chưa có ma trận để đối chiếu."
                  : short
                    ? `Còn thiếu ${short} câu so với ma trận.`
                    : "Đủ số câu theo ma trận."}
              </p>
            </div>
            <input
              aria-label="Tên đề"
              placeholder="Tên đề, ví dụ Kiểm tra giữa kỳ"
              className={`${inputClass.replace("w-full ", "")} w-72`}
              maxLength={255}
              value={title}
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
            />
            <button
              type="button"
              disabled={Boolean(saveBlocker) || saving}
              title={saveBlocker || undefined}
              onClick={() => void saveSet()}
              className="whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-500"
            >
              {saving ? "Đang lưu…" : flow ? "Lưu và thêm vào module" : "Lưu đề"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DocList({
  title,
  docs,
  chosen,
  onToggle,
  empty,
}: {
  title?: string;
  docs: QuizBuilderContext["documents"];
  chosen: string[];
  onToggle: (id: string) => void;
  empty?: string;
}) {
  return (
    <div className="mt-2">
      {title && <p className="text-xs font-medium text-slate-500">{title}</p>}
      {!docs.length && empty && <p className="mt-1 text-sm text-amber-800">{empty}</p>}
      <ul className="mt-1 grid gap-1 sm:grid-cols-2">
        {docs.map((d) => (
          <li key={d.document_id}>
            <label className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${d.ready ? "border-slate-200" : "border-dashed border-slate-200 text-slate-400"}`}>
              <input type="checkbox" disabled={!d.ready} checked={chosen.includes(d.document_id)} onChange={() => onToggle(d.document_id)} />
              <span className="min-w-0 flex-1 truncate" title={d.title}>
                {d.title}
              </span>
              {d.chapter_code && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">Ch.{d.chapter_code}</span>}
              {!d.ready && <span className="text-xs">chưa xử lý</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatrixGroup({
  label,
  los,
  levels,
  matrix,
  excluded,
  onToggle,
  onCell,
}: {
  label: string;
  los: Lo[];
  levels: number[];
  matrix: Record<string, number>;
  excluded: string[];
  onToggle: (loId: string) => void;
  onCell: (loId: string, level: number, value: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={levels.length + 2} className="pt-3 pb-1 text-xs font-semibold text-slate-500">
          {label}
        </td>
      </tr>
      {los.map((lo) => {
        const off = excluded.includes(lo.lo_id);
        const rowTotal = off ? 0 : levels.reduce((s, level) => s + (matrix[cellKey(lo.lo_id, level)] ?? 0), 0);
        return (
          <tr key={lo.lo_id} className={`border-b border-slate-100 ${off ? "opacity-40" : ""}`}>
            <td className="py-1.5 pr-2">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={!off} onChange={() => onToggle(lo.lo_id)} aria-label={`Dùng ${lo.code}`} />
                <span className="min-w-0">
                  <span className="font-semibold">{lo.code}</span>{" "}
                  <span className="line-clamp-1 text-slate-600" title={lo.statement_vi}>
                    {lo.statement_vi}
                  </span>
                  {lo.bloom_level && <span className="text-xs text-slate-400">Đề cương: {bloomLabel(lo.bloom_level)}</span>}
                </span>
              </label>
            </td>
            {levels.map((level) => (
              <td key={level} className={`px-1 text-center ${lo.bloom_level === level ? "bg-sky-50" : ""}`}>
                <input
                  type="number"
                  min={0}
                  max={MAX_PER_CELL}
                  disabled={off}
                  aria-label={`${lo.code} ${bloomLabel(level)}`}
                  value={matrix[cellKey(lo.lo_id, level)] ?? 0}
                  onChange={(e) => onCell(lo.lo_id, level, e.target.value)}
                  className={`w-14 rounded border px-1 py-1 text-center tabular-nums ${(matrix[cellKey(lo.lo_id, level)] ?? 0) > 0 ? "border-sky-500 font-semibold" : "border-slate-200 text-slate-400"}`}
                />
              </td>
            ))}
            <td className="text-right font-medium tabular-nums">{rowTotal}</td>
          </tr>
        );
      })}
    </>
  );
}
