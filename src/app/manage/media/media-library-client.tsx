"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface VideoAsset {
  asset_id: string;
  course_id: string | null;
  owner_id: string | null;
  title: string;
  description: string | null;
  tags: string[];
  object_key: string | null;
  duration_ms: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  source_type: "USER_UPLOAD" | "AI_STUDIO";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  transcript_status: "NONE" | "PENDING" | "PROCESSING" | "INDEXED" | "FAILED";
  visibility: "PRIVATE" | "COURSE" | "PUBLIC";
  usage_count: number;
  allow_fork: boolean;
  forked_from_id: string | null;
  ai_prompt: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  creatorName?: string;
  courseName?: string;
  courseCode?: string;
}

interface Props {
  sid: string;
  courseId: string;
  userSub?: string;
  userDisplayName?: string;
  /** Chế độ nhúng vào modal Micro Content để chọn video */
  onSelectVideo?: (asset: VideoAsset) => void;
  selectedAssetId?: string | null;
}

function formatDuration(ms: number | null) {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function MediaLibraryClient({
  sid,
  courseId,
  userSub,
  userDisplayName,
  onSelectVideo,
  selectedAssetId,
}: Props) {
  const router = useRouter();

  // Danh sách và bộ lọc
  const [items, setItems] = useState<VideoAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<"all" | "mine" | "course" | "public">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload modal & state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dedupPromptAsset, setDedupPromptAsset] = useState<VideoAsset | null>(null);

  // Edit metadata modal
  const [editingAsset, setEditingAsset] = useState<VideoAsset | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editVisibility, setEditVisibility] = useState<"PRIVATE" | "COURSE" | "PUBLIC">("COURSE");
  const [editTags, setEditTags] = useState("");
  const [editAllowFork, setEditAllowFork] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Video preview player modal
  const [previewAsset, setPreviewAsset] = useState<VideoAsset | null>(null);

  // Load danh sách video
  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        sid,
        scope,
        page: String(page),
        limit: "18",
      });
      if (search.trim()) {
        q.set("search", search.trim());
      }
      const res = await fetch(`/api/videos?${q.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể tải danh sách video.");
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }, [sid, scope, search, page]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Polling nếu có video đang render hoặc upload
  useEffect(() => {
    const hasPending = items.some(
      (v) => v.status === "PROCESSING" || v.status === "UPLOADING",
    );
    if (!hasPending) return;

    const timer = setInterval(() => {
      loadVideos();
    }, 5000);
    return () => clearInterval(timer);
  }, [items, loadVideos]);

  // Xử lý chọn file tải lên
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024 * 1024) {
      setUploadError("Video quá lớn. Kích thước tối đa là 1 GB.");
      return;
    }

    setUploadFile(file);
    if (!uploadTitle.trim()) {
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
    setUploadError(null);
    setDedupPromptAsset(null);

    // Kiểm tra SHA-256 deduplication
    setUploadStatusText("Đang tính mã băm SHA-256 để kiểm tra trùng lặp...");
    try {
      const hash = await computeSha256(file);
      setUploadStatusText("Đang kiểm tra trùng lặp trong hệ thống...");
      const checkRes = await fetch(`/api/videos/check-hash?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileHash: hash }),
      });
      const checkData = await checkRes.json();
      if (checkRes.ok && checkData.found && checkData.asset) {
        setDedupPromptAsset(checkData.asset);
        setUploadStatusText(null);
        return;
      }
    } catch {
      // Bỏ qua lỗi check hash nếu có
    }
    setUploadStatusText(null);
  };

  // Tiến hành Upload video
  const handleStartUpload = async () => {
    if (!uploadFile) {
      setUploadError("Vui lòng chọn một file video (.mp4 hoặc .webm).");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Vui lòng nhập tên tiêu đề video.");
      return;
    }

    setUploadError(null);
    setUploadProgress(10);
    setUploadStatusText("Đang khởi tạo phiên tải lên...");

    try {
      let durationMs = 0;
      try {
        const videoElement = document.createElement("video");
        videoElement.preload = "metadata";
        videoElement.src = URL.createObjectURL(uploadFile);
        await new Promise((resolve) => {
          videoElement.onloadedmetadata = () => {
            durationMs = Math.round(videoElement.duration * 1000);
            resolve(true);
          };
          videoElement.onerror = () => resolve(false);
        });
      } catch {
        durationMs = 0;
      }

      const fileHash = await computeSha256(uploadFile);
      setUploadProgress(25);
      setUploadStatusText("Đang yêu cầu Presigned URL từ MinIO...");

      const tagsArray = uploadTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const initRes = await fetch(`/api/videos/upload?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: uploadTitle.trim(),
          description: uploadDesc.trim() || undefined,
          tags: tagsArray,
          filename: uploadFile.name,
          mimeType: uploadFile.type || "video/mp4",
          fileHash,
          sizeBytes: uploadFile.size,
          courseId,
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok) {
        throw new Error(initData.error || "Không thể khởi tạo phiên upload.");
      }

      setUploadProgress(45);
      setUploadStatusText("Đang tải dữ liệu lên bộ nhớ MinIO...");

      // Tải file trực tiếp lên MinIO qua Presigned URL
      const putRes = await fetch(initData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": uploadFile.type || "video/mp4",
        },
        body: uploadFile,
      });

      if (!putRes.ok) {
        throw new Error(`MinIO lưu file thất bại: HTTP ${putRes.status}`);
      }

      setUploadProgress(85);
      setUploadStatusText("Đang hoàn tất và đồng bộ chỉ mục...");

      const confirmRes = await fetch(`/api/videos/confirm?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: initData.assetId,
          sizeBytes: uploadFile.size,
          durationMs: durationMs || 60000,
          objectKey: initData.objectKey,
        }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        throw new Error(confirmData.error || "Không thể xác nhận hoàn tất upload.");
      }

      setUploadProgress(100);
      setUploadStatusText("Tải lên thành công!");
      setTimeout(() => {
        setUploadModalOpen(false);
        setUploadFile(null);
        setUploadTitle("");
        setUploadDesc("");
        setUploadTags("");
        setUploadProgress(null);
        setUploadStatusText(null);
        setDedupPromptAsset(null);
        loadVideos();
      }, 800);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
      setUploadProgress(null);
      setUploadStatusText(null);
    }
  };

  // Mở modal chỉnh sửa quyền & thông tin
  const openEditModal = (asset: VideoAsset) => {
    setEditingAsset(asset);
    setEditTitle(asset.title);
    setEditDesc(asset.description || "");
    setEditVisibility(asset.visibility);
    setEditTags(asset.tags?.join(", ") || "");
    setEditAllowFork(asset.allow_fork ?? true);
  };

  // Lưu chỉnh sửa quyền & thông tin
  const handleSaveEdit = async () => {
    if (!editingAsset) return;
    setSavingEdit(true);
    try {
      const tagsArray = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(
        `/api/videos/${editingAsset.asset_id}?sid=${encodeURIComponent(sid)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim(),
            description: editDesc.trim() || undefined,
            visibility: editVisibility,
            tags: tagsArray,
            allowFork: editAllowFork,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể cập nhật video.");
      }
      setEditingAsset(null);
      loadVideos();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi cập nhật.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Xoá video an toàn
  const handleDelete = async (asset: VideoAsset) => {
    const isUsed = asset.usage_count > 0;
    const confirmMessage = isUsed
      ? `Video "${asset.title}" đang được gắn vào ${asset.usage_count} bài giảng Micro Content.\n\nNếu xóa, video sẽ bị ẩn khỏi Kho học liệu nhưng các bài giảng cũ của sinh viên vẫn phát bình thường (Xoá mềm an toàn).\n\nBạn có chắc chắn muốn xóa?`
      : `Bạn có chắc chắn muốn xóa vĩnh viễn video "${asset.title}"?`;

    if (!confirm(confirmMessage)) return;

    try {
      const res = await fetch(
        `/api/videos/${asset.asset_id}?sid=${encodeURIComponent(sid)}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể xoá video.");
      }
      loadVideos();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi xoá video.");
    }
  };

  // Nhân bản (Fork) AI Video
  const handleFork = async (asset: VideoAsset) => {
    if (!confirm(`Bạn có muốn nhân bản kịch bản AI của video "${asset.title}" vào khóa học hiện tại để tinh chỉnh tiếp không?`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/videos/${asset.asset_id}/fork?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể nhân bản video.");
      }
      alert("Đã nhân bản kịch bản thành công! Video mới đã xuất hiện trong danh sách của bạn.");
      loadVideos();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi nhân bản video.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Tổng số học liệu</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Video tải lên</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {items.filter((i) => i.source_type === "USER_UPLOAD").length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">AI Video Studio</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">
            {items.filter((i) => i.source_type === "AI_STUDIO").length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Lượt liên kết bài học</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {items.reduce((acc, curr) => acc + (curr.usage_count || 0), 0)}
          </p>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Scope Tabs */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {(
            [
              { key: "all", label: "Tất cả" },
              { key: "mine", label: "Của tôi" },
              { key: "course", label: "Khoá học này" },
              { key: "public", label: "Công khai (Public)" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setScope(tab.key);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                scope === tab.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Upload Action */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên, mô tả, thẻ..."
              className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setUploadFile(null);
              setUploadTitle("");
              setUploadDesc("");
              setUploadTags("");
              setUploadProgress(null);
              setUploadStatusText(null);
              setUploadError(null);
              setDedupPromptAsset(null);
              setUploadModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
          >
            <span className="text-base leading-none">+</span>
            Tải video mới lên
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && items.length === 0 && (
        <div className="py-16 text-center text-slate-500">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-2 text-sm">Đang tải kho học liệu...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            🎬
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-900">Không tìm thấy video nào</h3>
          <p className="mt-1 text-sm text-slate-500">
            {search
              ? "Thử tìm kiếm với từ khóa khác hoặc chuyển phạm vi hiển thị."
              : "Bấm 'Tải video mới lên' để bắt đầu lưu trữ học liệu dùng chung."}
          </p>
        </div>
      )}

      {/* Video Cards Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((video) => {
            const isProcessing = video.status === "PROCESSING" || video.status === "UPLOADING";
            const isFailed = video.status === "FAILED";
            const isReady = video.status === "READY";
            const isSelected = selectedAssetId === video.asset_id;

            return (
              <div
                key={video.asset_id}
                className={`group flex flex-col justify-between overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${
                  isSelected ? "border-indigo-600 ring-2 ring-indigo-500" : "border-slate-200"
                }`}
              >
                <div>
                  {/* Thumbnail / Player area */}
                  <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
                    {isReady ? (
                      <div className="relative w-full h-full group/video">
                        <video
                          src={`/api/videos/${video.asset_id}/stream?sid=${encodeURIComponent(sid)}`}
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewAsset(video)}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/video:opacity-100 transition text-white font-medium text-sm gap-2"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white">
                            ▶
                          </span>
                          Xem trước
                        </button>
                      </div>
                    ) : isProcessing ? (
                      <div className="flex flex-col items-center gap-2 text-indigo-400 px-4 text-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                        <span className="text-xs font-semibold">Đang xử lý video...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-red-400 px-4 text-center">
                        <span className="text-lg">⚠️</span>
                        <span className="text-xs font-semibold">Xử lý thất bại</span>
                      </div>
                    )}

                    {/* Duration badge */}
                    {video.duration_ms && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                        {formatDuration(video.duration_ms)}
                      </span>
                    )}

                    {/* Source badge */}
                    <span
                      className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        video.source_type === "AI_STUDIO"
                          ? "bg-purple-600 text-white"
                          : "bg-indigo-600 text-white"
                      }`}
                    >
                      {video.source_type === "AI_STUDIO" ? "AI Studio" : "Upload"}
                    </span>

                    {/* Visibility badge */}
                    <span
                      className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        video.visibility === "PUBLIC"
                          ? "bg-emerald-600 text-white"
                          : video.visibility === "COURSE"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-700 text-white"
                      }`}
                    >
                      {video.visibility === "PUBLIC"
                        ? "Public"
                        : video.visibility === "COURSE"
                          ? "Course"
                          : "Private"}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-4">
                    <h4 className="text-base font-semibold text-slate-900 line-clamp-1" title={video.title}>
                      {video.title}
                    </h4>

                    {video.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{video.description}</p>
                    )}

                    {/* Tags */}
                    {video.tags && video.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {video.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            #{tag}
                          </span>
                        ))}
                        {video.tags.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{video.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Meta info */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>{video.creatorName || "Ẩn danh"}</span>
                      <span>Dung lượng: {formatBytes(video.size_bytes)}</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Gắn vào: <strong>{video.usage_count}</strong> bài giảng
                      </span>
                      <span>{new Date(video.created_at).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action footer */}
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2">
                  {onSelectVideo ? (
                    <button
                      type="button"
                      onClick={() => onSelectVideo(video)}
                      disabled={!isReady}
                      className={`w-full rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        isSelected
                          ? "bg-indigo-600 text-white"
                          : isReady
                            ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {isSelected ? "✓ Đã chọn video này" : "Chọn video này"}
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(video)}
                          className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition"
                          title="Chỉnh sửa quyền & thông tin"
                        >
                          ✏️ Quyền & Thẻ
                        </button>

                        {video.source_type === "AI_STUDIO" && video.allow_fork && (
                          <button
                            type="button"
                            onClick={() => handleFork(video)}
                            className="rounded px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition"
                            title="Nhân bản (Fork) kịch bản AI sang khóa học này"
                          >
                            🌿 Fork AI
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(video)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition"
                        title="Xoá video"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-white">
              <h3 className="text-sm font-semibold truncate pr-4">{previewAsset.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <video
                src={`/api/videos/${previewAsset.asset_id}/stream?sid=${encodeURIComponent(sid)}`}
                controls
                autoPlay
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Chỉnh sửa quyền & thông tin video
              </h3>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Tiêu đề video</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Mô tả tóm tắt</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Quyền truy cập & Chia sẻ</label>
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="PUBLIC">Công khai toàn hệ thống (Mọi giảng viên đều tìm thấy và tái sử dụng)</option>
                  <option value="COURSE">Khoá học này ({courseId})</option>
                  <option value="PRIVATE">Chỉ riêng tôi (Riêng tư)</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Lưu ý: Nếu đổi về PRIVATE, các bài giảng đang sử dụng video này vẫn giữ nguyên quyền phát cho sinh viên đã ghi danh.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Thẻ tìm kiếm (phân cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="toan-cao-cap, lap-trinh, can-ban"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {editingAsset.source_type === "AI_STUDIO" && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="allowForkCheckbox"
                    checked={editAllowFork}
                    onChange={(e) => setEditAllowFork(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="allowForkCheckbox" className="text-xs font-medium text-slate-700">
                    Cho phép giảng viên khác Nhân bản (Fork) kịch bản AI của video này
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {savingEdit ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Video Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Tải video mới lên Kho học liệu
              </h3>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* File input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Chọn file Video (.mp4, .webm)</label>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={handleFileSelected}
                  disabled={uploadProgress !== null}
                  className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {/* Deduplication Prompt Alert */}
              {dedupPromptAsset && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    💡 Video này đã tồn tại trong hệ thống!
                  </p>
                  <p>
                    Tên video: <strong>{dedupPromptAsset.title}</strong>
                    <br />
                    Tác giả: <strong>{dedupPromptAsset.creatorName || "Ẩn danh"}</strong>
                  </p>
                  <p className="text-amber-700">
                    Bạn không cần tốn băng thông và dung lượng lưu trữ để upload lại. Hệ thống sẽ tự động liên kết với bản ghi đã có.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">Tên bài giảng / Tiêu đề</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  disabled={uploadProgress !== null}
                  placeholder="Ví dụ: Giới thiệu giải thuật Sắp xếp Nhanh"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Mô tả tóm tắt</label>
                <textarea
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  disabled={uploadProgress !== null}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Thẻ tìm kiếm</label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  disabled={uploadProgress !== null}
                  placeholder="thuat-toan, quicksort, c-plus-plus"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Progress Bar & Status */}
              {uploadProgress !== null && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>{uploadStatusText || "Đang tải lên..."}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {uploadError && (
                <div className="rounded-md bg-red-50 p-3 text-xs text-red-700">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                disabled={uploadProgress !== null}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleStartUpload}
                disabled={uploadProgress !== null || !uploadFile || !uploadTitle.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {uploadProgress !== null ? "Đang xử lý..." : "Bắt đầu tải lên"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

