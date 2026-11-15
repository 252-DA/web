"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type ManageMicroContentItem = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  videoSource: string;
  videoStatus: string;
  videoDurationMs: number | null;
  videoError: string | null;
  passingScore: number;
  requiredWatchPercent: number;
  status: string;
  sourceDocumentId: string | null;
  sourceDocumentTitle: string | null;
  sourcePageFrom: number | null;
  sourcePageTo: number | null;
  loId: string | null;
  loCode: string | null;
  loStatementVi: string | null;
  position: number | null;
  scriptStatus: string;
  hasScript: boolean;
  lowText?: boolean;
  flaggedSceneCount: number;
  questionCount: number;
  attemptCount: number;
  createdAt: string;
};

export type LectureDocumentOption = {
  document_id: string;
  title: string;
  chapter_code: string | null;
  chunks_count: number;
  role: string;
};

export type LeafLoOption = {
  lo_id: string;
  code: string;
  statement_vi: string;
};

export type OutlineRequestItem = {
  request_id: string;
  status: string;
  scope?: Record<string, unknown>;
  last_error?: string | null;
  generated_count?: number;
  created_at?: string;
};

interface Props {
  sid: string;
  items: ManageMicroContentItem[];
  lectureDocs: LectureDocumentOption[];
  leafLos: LeafLoOption[];
  initialOutlineRequests: OutlineRequestItem[];
}

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type RowEdit = {
  title: string;
  pageFrom: string;
  pageTo: string;
  loId: string;
};

export function ManageMicroContentClient({
  sid,
  items,
  lectureDocs,
  leafLos,
  initialOutlineRequests,
}: Props) {
  const router = useRouter();
  const [selectedDocId, setSelectedDocId] = useState<string>(
    lectureDocs[0]?.document_id ?? "",
  );
  const [polledOutlines, setPolledOutlines] = useState<OutlineRequestItem[] | null>(null);
  const outlineRequests = useMemo(
    () => polledOutlines ?? initialOutlineRequests,
    [polledOutlines, initialOutlineRequests],
  );
  const [requestingOutline, setRequestingOutline] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchDocId, setBatchDocId] = useState<string | null>(null);
  const [addingDocId, setAddingDocId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPageFrom, setNewPageFrom] = useState("1");
  const [newPageTo, setNewPageTo] = useState("5");
  const [newLoId, setNewLoId] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(
    null,
  );

  // Chỉ lưu các hàng đã chỉnh sửa cục bộ; hàng mới từ server mặc định đọc trực tiếp từ `items`
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  const activeOutline = useMemo(
    () => outlineRequests.find((r) => r.status === "QUEUED" || r.status === "RUNNING" || r.status === "PROCESSING"),
    [outlineRequests],
  );
  const latestOutline = outlineRequests[0] ?? null;
  const anyItemBusy = items.some(
    (it) => it.scriptStatus === "GENERATING" || it.videoStatus === "PROCESSING",
  );

  // Tự động thăm dò trạng thái tách slide hoặc sinh kịch bản/video đang chạy
  useEffect(() => {
    if (!activeOutline && !anyItemBusy) return;
    let stopped = false;

    const tick = async () => {
      try {
        if (activeOutline) {
          const res = await fetch(
            `/api/micro-content/outline?sid=${encodeURIComponent(sid)}`,
            { cache: "no-store" },
          );
          if (res.ok && !stopped) {
            const list = (await res.json()) as OutlineRequestItem[];
            setPolledOutlines(list);
          }
        }
        if (!stopped) {
          router.refresh();
        }
      } catch {
        // Bỏ qua lỗi mạng thoáng qua
      }
    };

    const timer = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeOutline, anyItemBusy, sid, router]);

  const { slideGroups, unlinkedItems } = useMemo(() => {
    const groupMap = new Map<
      string,
      { docId: string; docTitle: string; rows: ManageMicroContentItem[] }
    >();
    const loose: ManageMicroContentItem[] = [];

    for (const item of items) {
      if (item.sourceDocumentId) {
        let group = groupMap.get(item.sourceDocumentId);
        if (!group) {
          group = {
            docId: item.sourceDocumentId,
            docTitle: item.sourceDocumentTitle || "Bộ slide bài giảng",
            rows: [],
          };
          groupMap.set(item.sourceDocumentId, group);
        }
        group.rows.push(item);
      } else {
        loose.push(item);
      }
    }

    return {
      slideGroups: Array.from(groupMap.values()),
      unlinkedItems: loose,
    };
  }, [items]);

  const handleRequestOutline = async () => {
    if (!selectedDocId) return;
    setRequestingOutline(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/micro-content/outline?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: selectedDocId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gửi yêu cầu tách nội dung slide.");
      }
      setPolledOutlines((prev) => {
        const base = prev ?? initialOutlineRequests;
        return [
          {
            request_id: data.requestId,
            status: data.status || "QUEUED",
            scope: { document_id: selectedDocId },
          },
          ...base.filter((r) => r.request_id !== data.requestId),
        ];
      });
      setFeedback({
        text: data.deduplicated
          ? "Bộ slide này đang được tách nội dung, vui lòng đợi vài giây..."
          : "Đã gửi yêu cầu đề xuất nội dung từ bộ slide!",
        type: "success",
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Đã có lỗi khi tách nội dung.",
        type: "error",
      });
    } finally {
      setRequestingOutline(false);
    }
  };

  const handleSaveRow = async (item: ManageMicroContentItem) => {
    const draft = edits[item.id];
    if (!draft || !draft.title.trim()) {
      setFeedback({ text: "Tên nội dung không được để trống.", type: "error" });
      return;
    }
    setBusyId(item.id);
    setFeedback(null);
    try {
      const pageFrom = draft.pageFrom.trim() ? Number(draft.pageFrom) : null;
      const pageTo = draft.pageTo.trim() ? Number(draft.pageTo) : null;
      const res = await fetch(
        `/api/micro-content/${item.id}?sid=${encodeURIComponent(sid)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title.trim(),
            sourcePageFrom: pageFrom,
            sourcePageTo: pageTo,
            loId: draft.loId || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Lưu thay đổi thất bại.");
      }
      setEdits((prev) => {
        if (!(item.id in prev)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setFeedback({ text: `Đã lưu "${draft.title.trim()}".`, type: "success" });
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Không thể lưu nội dung.",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRequestScript = async (item: ManageMicroContentItem) => {
    setBusyId(item.id);
    setFeedback(null);
    try {
      // Lưu thay đổi inline (nếu có sửa dải trang/tiêu đề/LO) trước khi sinh kịch bản
      const draft = edits[item.id];
      if (draft && isRowDirty(item, draft)) {
        const saveRes = await fetch(
          `/api/micro-content/${item.id}?sid=${encodeURIComponent(sid)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: draft.title.trim(),
              sourcePageFrom: draft.pageFrom.trim() ? Number(draft.pageFrom) : null,
              sourcePageTo: draft.pageTo.trim() ? Number(draft.pageTo) : null,
              loId: draft.loId || null,
            }),
          },
        );
        if (!saveRes.ok) {
          const saveErr = await saveRes.json();
          throw new Error(saveErr.error || "Không lưu được chỉnh sửa trước khi sinh kịch bản.");
        }
      }

      const res = await fetch(
        `/api/micro-content/${item.id}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request_script" }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gửi yêu cầu sinh kịch bản.");
      }
      setFeedback({
        text: `Đang sinh kịch bản từ slide cho "${draft?.title || item.title}"...`,
        type: "success",
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Lỗi khi sinh kịch bản.",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchScripts = async (
    docId: string,
    rows: ManageMicroContentItem[],
  ) => {
    const targets = rows.filter(
      (r) => r.scriptStatus !== "GENERATING" && r.scriptStatus !== "READY",
    );
    if (targets.length === 0) return;

    setBatchDocId(docId);
    setFeedback(null);
    let sent = 0;
    try {
      for (const row of targets) {
        const res = await fetch(
          `/api/micro-content/${row.id}/ai?sid=${encodeURIComponent(sid)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "request_script" }),
          },
        );
        if (res.ok) sent += 1;
      }
      setFeedback({
        text: `Đã gửi yêu cầu sinh kịch bản cho ${sent}/${targets.length} nội dung.`,
        type: "success",
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Lỗi khi sinh kịch bản hàng loạt.",
        type: "error",
      });
    } finally {
      setBatchDocId(null);
    }
  };

  const handleAddSection = async (docId: string, nextPos: number) => {
    if (!newTitle.trim()) {
      setFeedback({ text: "Vui lòng nhập tên nội dung mới.", type: "error" });
      return;
    }
    setBusyId(`add-${docId}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/micro-content?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          videoSource: "AI",
          sourceDocumentId: docId,
          sourcePageFrom: Number(newPageFrom) || 1,
          sourcePageTo: Number(newPageTo) || Number(newPageFrom) || 1,
          loId: newLoId || null,
          position: nextPos,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể thêm nội dung.");
      }
      setAddingDocId(null);
      setNewTitle("");
      setNewLoId("");
      setFeedback({ text: "Đã thêm nội dung mới vào dàn ý bộ slide.", type: "success" });
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Lỗi khi thêm nội dung.",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: ManageMicroContentItem) => {
    if (!window.confirm(`Xóa bài "${item.title}"?`)) return;
    setBusyId(item.id);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/micro-content/${item.id}?sid=${encodeURIComponent(sid)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Không thể xóa.");
      }
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Không thể xóa.",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* B2: Tạo từ bộ slide */}
      <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Tạo từ bộ slide</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Chọn bộ slide bài giảng của chương để AI đề xuất các nội dung ngắn (mỗi nội dung gồm video 2–4 phút và câu hỏi củng cố bám đúng các trang slide).
            </p>
          </div>
          {activeOutline && (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-800">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              Đang phân tích cấu trúc bộ slide...
            </span>
          )}
        </div>

        {lectureDocs.length === 0 ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600">
            Chưa có bộ slide bài giảng (role = lecture) đã lập chỉ mục trong khóa học này. Vui lòng tải lên hoặc đồng bộ tài liệu trước.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              disabled={requestingOutline}
              className="min-w-[280px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            >
              {lectureDocs.map((doc) => (
                <option key={doc.document_id} value={doc.document_id}>
                  {doc.chapter_code ? `Chương ${doc.chapter_code} · ` : ""}
                  {doc.title} ({doc.chunks_count} đoạn)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRequestOutline}
              disabled={requestingOutline || !selectedDocId || Boolean(activeOutline)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {requestingOutline || activeOutline
                ? "Đang đề xuất nội dung..."
                : "Đề xuất nội dung từ slide"}
            </button>
          </div>
        )}

        {latestOutline?.status === "FAILED" && latestOutline.last_error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            Lần tách slide gần nhất gặp lỗi: {latestOutline.last_error}
          </div>
        )}
      </div>

      {/* Nội dung đề xuất từ slide (theo từng bộ slide) */}
      {slideGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Nội dung đề xuất từ slide
            </h2>
          </div>

          {slideGroups.map((group) => {
            const pendingScriptCount = group.rows.filter(
              (r) => r.scriptStatus !== "READY" && r.scriptStatus !== "GENERATING",
            ).length;
            const maxPos = group.rows.reduce(
              (acc, r) => Math.max(acc, r.position ?? 0),
              group.rows.length,
            );

            return (
              <div
                key={group.docId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {group.docTitle}
                    </h3>
                    <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {group.rows.length} nội dung
                    </span>
                    <a
                      href={withSid(`/api/documents/${group.docId}/file`, sid)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline"
                    >
                      Xem PDF gốc ↗
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAddingDocId(addingDocId === group.docId ? null : group.docId)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      + Thêm nội dung
                    </button>
                    {pendingScriptCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleBatchScripts(group.docId, group.rows)}
                        disabled={batchDocId === group.docId}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {batchDocId === group.docId
                          ? "Đang gửi..."
                          : `Sinh kịch bản (${pendingScriptCount} bài)`}
                      </button>
                    )}
                  </div>
                </div>

                {addingDocId === group.docId && (
                  <div className="border-b border-slate-200 bg-sky-50/50 px-5 py-3 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Tên nội dung
                      </label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Ví dụ: Cơ chế Broadcast Variable"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">
                        Từ trang
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={newPageFrom}
                        onChange={(e) => setNewPageFrom(e.target.value)}
                        className="mt-1 w-16 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">
                        Đến trang
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={newPageTo}
                        onChange={(e) => setNewPageTo(e.target.value)}
                        className="mt-1 w-16 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-center"
                      />
                    </div>
                    <div className="min-w-[180px]">
                      <label className="block text-[11px] font-medium text-slate-600">
                        LO chính
                      </label>
                      <select
                        value={newLoId}
                        onChange={(e) => setNewLoId(e.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="">-- Chọn LO --</option>
                        {leafLos.map((lo) => (
                          <option key={lo.lo_id} value={lo.lo_id}>
                            {lo.code} — {lo.statement_vi}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddSection(group.docId, maxPos + 1)}
                      disabled={busyId === `add-${group.docId}`}
                      className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      Thêm
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {group.rows.map((item) => {
                    const draft = edits[item.id] ?? {
                      title: item.title,
                      pageFrom: item.sourcePageFrom ? String(item.sourcePageFrom) : "",
                      pageTo: item.sourcePageTo ? String(item.sourcePageTo) : "",
                      loId: item.loId || "",
                    };
                    const dirty = isRowDirty(item, draft);
                    const isBusy = busyId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between hover:bg-slate-50/50"
                      >
                        <div className="flex-1 grid gap-3 sm:grid-cols-12 items-start">
                          <div className="sm:col-span-5">
                            <input
                              type="text"
                              value={draft.title}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, title: e.target.value },
                                }))
                              }
                              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
                            />
                            {item.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                {item.description}
                              </p>
                            )}
                          </div>

                          <div className="sm:col-span-3 flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Trang</span>
                            <input
                              type="number"
                              min={1}
                              value={draft.pageFrom}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, pageFrom: e.target.value },
                                }))
                              }
                              className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs text-center"
                            />
                            <span className="text-xs text-slate-400">–</span>
                            <input
                              type="number"
                              min={1}
                              value={draft.pageTo}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, pageTo: e.target.value },
                                }))
                              }
                              className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs text-center"
                            />
                            {draft.pageFrom && (
                              <a
                                href={`${withSid(
                                  `/api/documents/${group.docId}/file`,
                                  sid,
                                )}#page=${draft.pageFrom}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Mở trang này trong PDF"
                                className="text-[11px] font-medium text-sky-600 hover:underline ml-1"
                              >
                                Xem
                              </a>
                            )}
                          </div>

                          <div className="sm:col-span-4">
                            <select
                              value={draft.loId}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, loId: e.target.value },
                                }))
                              }
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                            >
                              <option value="">Chưa gắn LO</option>
                              {leafLos.map((lo) => (
                                <option key={lo.lo_id} value={lo.lo_id}>
                                  {lo.code} — {lo.statement_vi}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <ScriptBadge
                                status={item.scriptStatus}
                                flaggedCount={item.flaggedSceneCount}
                              />
                              <VideoBadge
                                status={item.videoStatus}
                                durationMs={item.videoDurationMs}
                              />
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                                {item.questionCount} câu hỏi
                              </span>
                              {item.lowText && (
                                <span
                                  className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-800"
                                  title="Dải trang nguồn có ít chữ (nhiều hình/biểu đồ)"
                                >
                                  Ít chữ
                                </span>
                              )}
                              {item.status === "PUBLISHED" && (
                                <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-700">
                                  Đã xuất bản
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          {dirty && (
                            <button
                              type="button"
                              onClick={() => handleSaveRow(item)}
                              disabled={isBusy}
                              className="rounded-lg border border-sky-600 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            >
                              Lưu
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRequestScript(item)}
                            disabled={isBusy || item.scriptStatus === "GENERATING"}
                            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                          >
                            {item.scriptStatus === "GENERATING"
                              ? "Đang sinh..."
                              : item.hasScript
                              ? "Sinh lại kịch bản"
                              : "Sinh kịch bản"}
                          </button>
                          <a
                            href={withSid(`/manage/micro-content/${item.id}/edit?tab=video`, sid)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Biên tập
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={isBusy}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bảng các bài Micro Content tạo thủ công / chưa gắn bộ slide */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h3 className="text-lg font-medium text-slate-800">Chưa có bài Micro Content nào</h3>
          <p className="mt-1 text-sm text-slate-500">
            Hãy chọn một bộ slide ở khung &ldquo;Tạo từ bộ slide&rdquo; phía trên hoặc tạo thủ công bài học mới.
          </p>
        </div>
      ) : (
        unlinkedItems.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {slideGroups.length > 0 && (
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-semibold uppercase text-slate-500">
                Micro Content khác ({unlinkedItems.length})
              </div>
            )}
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4">Tiêu đề</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Video</th>
                  <th className="px-6 py-4">Câu hỏi</th>
                  <th className="px-6 py-4">Yêu cầu</th>
                  <th className="px-6 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unlinkedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <a
                        href={withSid(`/manage/micro-content/${item.id}/edit`, sid)}
                        className="font-medium text-slate-900 hover:text-sky-600"
                      >
                        {item.title}
                      </a>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.status === "PUBLISHED" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                          Đã xuất bản
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Bản nháp
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <VideoBadge status={item.videoStatus} durationMs={item.videoDurationMs} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-800">{item.questionCount} câu</span>
                      <p className="text-xs text-slate-400">{item.attemptCount} lượt làm</p>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <p>Xem: ≥ {item.requiredWatchPercent}%</p>
                      <p>Điểm đạt: ≥ {item.passingScore}%</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={withSid(`/manage/micro-content/${item.id}/edit`, sid)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Chỉnh sửa
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function isRowDirty(item: ManageMicroContentItem, draft: RowEdit): boolean {
  return (
    draft.title !== item.title ||
    draft.pageFrom !== (item.sourcePageFrom ? String(item.sourcePageFrom) : "") ||
    draft.pageTo !== (item.sourcePageTo ? String(item.sourcePageTo) : "") ||
    draft.loId !== (item.loId || "")
  );
}

function ScriptBadge({ status, flaggedCount }: { status: string; flaggedCount: number }) {
  if (status === "GENERATING") {
    return (
      <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-800 animate-pulse">
        Đang sinh kịch bản...
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="rounded bg-rose-50 border border-rose-200 px-2 py-0.5 text-rose-700">
        Lỗi sinh kịch bản
      </span>
    );
  }
  if (status === "READY") {
    return (
      <>
        <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-700">
          Đã có kịch bản
        </span>
        {flaggedCount > 0 && (
          <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 font-medium text-amber-900">
            ⚠ {flaggedCount} cảnh cần kiểm tra
          </span>
        )}
      </>
    );
  }
  return <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">Chưa có kịch bản</span>;
}

function VideoBadge({ status, durationMs }: { status: string; durationMs: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          status === "READY"
            ? "bg-emerald-500"
            : status === "PROCESSING" || status === "UPLOADING"
            ? "bg-amber-500 animate-pulse"
            : status === "FAILED"
            ? "bg-rose-500"
            : "bg-slate-300"
        }`}
      />
      <span>
        {status === "READY"
          ? `Video (${formatDuration(durationMs)})`
          : status === "PROCESSING"
          ? "Đang dựng..."
          : status === "UPLOADING"
          ? "Đang tải lên..."
          : status === "FAILED"
          ? "Lỗi dựng video"
          : "Chưa có video"}
      </span>
    </span>
  );
}
