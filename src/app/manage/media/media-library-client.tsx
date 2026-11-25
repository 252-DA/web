"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface VideoYoutubeOptions {
  youtubeVideoId?: string | null;
  channelTitle?: string | null;
  thumbnailUrl?: string | null;
  watchUrl?: string | null;
  startSec?: number | null;
  endSec?: number | null;
}

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
  source_type: "USER_UPLOAD" | "AI_STUDIO" | "YOUTUBE";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  transcript_status: "NONE" | "PENDING" | "PROCESSING" | "INDEXED" | "FAILED";
  visibility: "PRIVATE" | "COURSE" | "PUBLIC";
  usage_count: number;
  allow_fork: boolean;
  forked_from_id: string | null;
  ai_prompt: string | null;
  ai_options?: VideoYoutubeOptions | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  creatorName?: string;
  courseName?: string;
  courseCode?: string;
}

export interface RecommendedVideoAsset extends VideoAsset {
  matchScore: number;
  matchReasons: string[];
  matchedKeywords: string[];
  isCurrentlyAttached?: boolean;
}

export interface YoutubeSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  descriptionSnippet: string;
  durationText: string | null;
  durationMs: number | null;
  viewCountText: string | null;
  publishedText: string | null;
  thumbnailUrl: string;
  watchUrl: string;
  embedUrl: string;
}

export interface YoutubeAttachPayload {
  youtubeVideoId: string;
  title: string;
  description?: string;
  channelTitle?: string;
  durationMs?: number;
  startSec?: number;
  endSec?: number;
  tags?: string[];
}

interface Props {
  sid: string;
  courseId: string;
  userSub?: string;
  userDisplayName?: string;
  /** Ngữ cảnh bài học Micro Content để gợi ý video tương tự và gắn video YouTube */
  microContentId?: string;
  microContentTitle?: string;
  microContentDescription?: string | null;
  /** Chế độ nhúng vào modal Micro Content để chọn video */
  onSelectVideo?: (asset: VideoAsset) => void | Promise<void>;
  onAttachYoutube?: (payload: YoutubeAttachPayload) => Promise<void>;
  selectedAssetId?: string | null;
}

function getAssetYoutubeId(asset: VideoAsset): string | null {
  if (asset.ai_options?.youtubeVideoId) return asset.ai_options.youtubeVideoId;
  if (asset.object_key?.startsWith("youtube:")) {
    return asset.object_key.slice("youtube:".length);
  }
  return null;
}

function getAssetYoutubeThumbnail(asset: VideoAsset): string | null {
  if (asset.ai_options?.thumbnailUrl) return asset.ai_options.thumbnailUrl;
  const id = getAssetYoutubeId(asset);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function getAssetYoutubeEmbedUrl(asset: VideoAsset): string | null {
  const id = getAssetYoutubeId(asset);
  if (!id) return null;
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", autoplay: "1" });
  if (typeof asset.ai_options?.startSec === "number" && asset.ai_options.startSec > 0) {
    params.set("start", String(Math.floor(asset.ai_options.startSec)));
  }
  if (typeof asset.ai_options?.endSec === "number" && asset.ai_options.endSec > 0) {
    params.set("end", String(Math.floor(asset.ai_options.endSec)));
  }
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

function buildYoutubePreviewEmbedUrl(
  videoId: string,
  startSec?: string,
  endSec?: string,
): string {
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", autoplay: "1" });
  const s = startSec ? parseInt(startSec, 10) : NaN;
  const e = endSec ? parseInt(endSec, 10) : NaN;
  if (Number.isFinite(s) && s > 0) params.set("start", String(s));
  if (Number.isFinite(e) && e > 0) params.set("end", String(e));
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
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
  microContentId,
  microContentTitle,
  microContentDescription,
  onSelectVideo,
  onAttachYoutube,
  selectedAssetId,
}: Props) {
  const router = useRouter();

  // Chế độ con khi nhúng trong trình soạn Micro Content
  const [pickerTab, setPickerTab] = useState<"LIBRARY" | "YOUTUBE">("LIBRARY");

  // Đề xuất tương tự trong kho học liệu
  const [recommendations, setRecommendations] = useState<RecommendedVideoAsset[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recKeywords, setRecKeywords] = useState<string[]>([]);
  const [suggestedQuery, setSuggestedQuery] = useState<string>(microContentTitle || "");

  // Tìm kiếm YouTube
  const [ytQuery, setYtQuery] = useState<string>(microContentTitle || "");
  const [ytLang, setYtLang] = useState<"all" | "vi" | "en">("all");
  const [ytItems, setYtItems] = useState<YoutubeSearchItem[]>([]);
  const [ytSource, setYtSource] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytHasSearched, setYtHasSearched] = useState(false);
  const [attachingYtId, setAttachingYtId] = useState<string | null>(null);
  const [attachedYtId, setAttachedYtId] = useState<string | null>(null);
  const [previewYoutube, setPreviewYoutube] = useState<YoutubeSearchItem | null>(null);
  const [ytStartInput, setYtStartInput] = useState("");
  const [ytEndInput, setYtEndInput] = useState("");

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

  // Đề xuất video tương tự trong kho dựa trên nội dung bài Micro Content
  const loadRecommendations = useCallback(async () => {
    if (!microContentId) return;
    setRecLoading(true);
    setRecError(null);
    try {
      const q = new URLSearchParams({
        sid,
        microContentId,
        limit: "6",
      });
      const res = await fetch(`/api/videos/recommendations?${q.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể tải gợi ý video tương tự.");
      }
      setRecommendations(Array.isArray(data.items) ? data.items : []);
      setRecKeywords(Array.isArray(data.keywords) ? data.keywords : []);
      if (typeof data.suggestedQuery === "string" && data.suggestedQuery.trim()) {
        setSuggestedQuery(data.suggestedQuery.trim());
        setYtQuery((prev) => (prev.trim() ? prev : data.suggestedQuery.trim()));
      }
    } catch (err) {
      setRecError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setRecLoading(false);
    }
  }, [sid, microContentId]);

  useEffect(() => {
    if (microContentId) {
      void loadRecommendations();
    }
  }, [microContentId, loadRecommendations]);

  // Tìm kiếm video YouTube có nội dung tương tự
  const runYoutubeSearch = useCallback(
    async (overrideQuery?: string, overrideLang?: "all" | "vi" | "en") => {
      const effectiveQuery = (overrideQuery ?? ytQuery).trim();
      const effectiveLang = overrideLang ?? ytLang;
      if (!effectiveQuery) {
        setYtError("Vui lòng nhập từ khóa hoặc dán liên kết YouTube.");
        return;
      }
      setYtLoading(true);
      setYtError(null);
      setYtHasSearched(true);
      try {
        const q = new URLSearchParams({
          sid,
          q: effectiveQuery,
          lang: effectiveLang,
          limit: "9",
        });
        const res = await fetch(`/api/videos/youtube-search?${q.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Không thể tìm kiếm video trên YouTube.");
        }
        setYtItems(Array.isArray(data.items) ? data.items : []);
        setYtSource(typeof data.source === "string" ? data.source : null);
      } catch (err) {
        setYtError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
        setYtItems([]);
      } finally {
        setYtLoading(false);
      }
    },
    [sid, ytQuery, ytLang],
  );

  // Tự động tìm kiếm YouTube lần đầu khi mở tab YouTube
  useEffect(() => {
    if (pickerTab === "YOUTUBE" && !ytHasSearched && !ytLoading) {
      const initialQ = (ytQuery || suggestedQuery || microContentTitle || "").trim();
      if (initialQ) {
        if (!ytQuery.trim()) setYtQuery(initialQ);
        void runYoutubeSearch(initialQ);
      }
    }
  }, [pickerTab, ytHasSearched, ytLoading, ytQuery, suggestedQuery, microContentTitle, runYoutubeSearch]);

  const handleAttachYoutubeItem = async (
    item: YoutubeSearchItem,
    opts?: { startSec?: number; endSec?: number },
  ) => {
    if (!onAttachYoutube) return;
    setAttachingYtId(item.videoId);
    setYtError(null);
    try {
      await onAttachYoutube({
        youtubeVideoId: item.videoId,
        title: item.title,
        description: item.descriptionSnippet || undefined,
        channelTitle: item.channelTitle || undefined,
        durationMs: item.durationMs ?? undefined,
        startSec: opts?.startSec,
        endSec: opts?.endSec,
        tags: recKeywords.slice(0, 4),
      });
      setAttachedYtId(item.videoId);
      setPreviewYoutube(null);
      await loadVideos();
      await loadRecommendations();
    } catch (err) {
      setYtError(
        err instanceof Error ? err.message : "Không thể gắn video YouTube vào bài học.",
      );
    } finally {
      setAttachingYtId(null);
    }
  };

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

  const baseSuggestedQuery = (
    suggestedQuery ||
    microContentTitle ||
    microContentDescription ||
    ""
  )
    .trim()
    .slice(0, 80);

  return (
    <div className="space-y-6">
      {/* Subtabs khi mở bên trong trình chỉnh sửa Micro Content */}
      {microContentId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPickerTab("LIBRARY")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                pickerTab === "LIBRARY"
                  ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📚 Kho học liệu &amp; Đề xuất tương tự</span>
              {recommendations.length > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  {recommendations.length} gợi ý
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPickerTab("YOUTUBE")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                pickerTab === "YOUTUBE"
                  ? "bg-white text-rose-700 shadow-sm ring-1 ring-rose-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="inline-flex h-4 w-5 items-center justify-center rounded bg-rose-600 text-[9px] font-bold text-white">
                ▶
              </span>
              <span>Tìm trên YouTube (nội dung tương tự)</span>
            </button>
          </div>
          {baseSuggestedQuery && (
            <span className="px-2 text-[11px] text-slate-500 truncate max-w-xs">
              Chủ đề bài: <strong className="text-slate-700">{baseSuggestedQuery}</strong>
            </span>
          )}
        </div>
      )}

      {/* Phần 1: Gợi ý video có nội dung tương tự trong Kho học liệu */}
      {microContentId && pickerTab === "LIBRARY" && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/60 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span>✨</span> Đề xuất video có nội dung tương tự trong kho
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Xếp hạng theo mức độ trùng khớp tiêu đề, mô tả, chuẩn đầu ra (LO), slide nguồn và lời giảng.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextQ = baseSuggestedQuery || ytQuery;
                  setYtQuery(nextQ);
                  setPickerTab("YOUTUBE");
                  if (nextQ) void runYoutubeSearch(nextQ);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
              >
                <span>▶</span> Tìm thêm trên YouTube
              </button>
            </div>
          </div>

          {recKeywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 font-medium">Từ khóa bài học:</span>
              {recKeywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full bg-white border border-indigo-200 px-2 py-0.5 font-medium text-indigo-800"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {recLoading && (
            <div className="py-6 text-center text-xs text-slate-500">
              <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mr-2 align-middle" />
              Đang phân tích mức độ tương đồng với các video trong kho...
            </div>
          )}

          {!recLoading && recError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {recError}
            </div>
          )}

          {!recLoading && !recError && recommendations.length === 0 && (
            <div className="rounded-lg border border-dashed border-indigo-200 bg-white/80 p-4 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <span>
                Chưa tìm thấy video nào trong kho có từ khóa trùng khớp mạnh với bài học này. Bạn có thể tìm video trên YouTube hoặc chọn thủ công ở danh sách bên dưới.
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextQ = baseSuggestedQuery || ytQuery;
                  setYtQuery(nextQ);
                  setPickerTab("YOUTUBE");
                  if (nextQ) void runYoutubeSearch(nextQ);
                }}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                ▶ Tìm trên YouTube ngay
              </button>
            </div>
          )}

          {!recLoading && recommendations.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recommendations.map((rec) => {
                const isSelected = selectedAssetId === rec.asset_id || rec.isCurrentlyAttached;
                const ytThumb = getAssetYoutubeThumbnail(rec);
                return (
                  <div
                    key={rec.asset_id}
                    className={`flex flex-col justify-between overflow-hidden rounded-lg border bg-white shadow-sm transition ${
                      isSelected ? "border-indigo-600 ring-2 ring-indigo-500" : "border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="relative aspect-video w-full bg-slate-900 overflow-hidden group/rec">
                        {ytThumb ? (
                          <img
                            src={ytThumb}
                            alt={rec.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <video
                            src={`/api/videos/${rec.asset_id}/stream?sid=${encodeURIComponent(sid)}`}
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setPreviewAsset(rec)}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/rec:opacity-100 transition text-white text-xs font-semibold gap-1.5"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25">
                            ▶
                          </span>
                          Xem trước
                        </button>
                        <span className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                          Khớp {rec.matchScore}%
                        </span>
                        <span
                          className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            rec.source_type === "AI_STUDIO"
                              ? "bg-purple-600 text-white"
                              : rec.source_type === "YOUTUBE"
                                ? "bg-rose-600 text-white"
                                : "bg-indigo-600 text-white"
                          }`}
                        >
                          {rec.source_type === "AI_STUDIO"
                            ? "AI Studio"
                            : rec.source_type === "YOUTUBE"
                              ? "YouTube"
                              : "Upload"}
                        </span>
                        {rec.duration_ms && (
                          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {formatDuration(rec.duration_ms)}
                          </span>
                        )}
                      </div>
                      <div className="p-3 space-y-1.5">
                        <h5 className="text-xs font-bold text-slate-900 line-clamp-2" title={rec.title}>
                          {rec.title}
                        </h5>
                        {rec.matchReasons && rec.matchReasons.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {rec.matchReasons.slice(0, 2).map((reason, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onSelectVideo?.(rec)}
                        className={`w-full rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                          isSelected
                            ? "bg-indigo-600 text-white"
                            : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                        }`}
                      >
                        {isSelected ? "✓ Đang gắn vào bài học" : "Chọn video này"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Phần 2: Tìm kiếm và gắn video YouTube tương tự */}
      {microContentId && pickerTab === "YOUTUBE" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="inline-flex h-5 w-6 items-center justify-center rounded bg-rose-600 text-[10px] font-bold text-white">
                  ▶
                </span>
                Tìm kiếm video YouTube có nội dung tương tự
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Tìm theo từ khóa chủ đề hoặc dán trực tiếp liên kết YouTube (`youtube.com/watch?v=...`, `youtu.be/...`), xem trước và gắn trực tiếp vào bài học.
              </p>
            </div>
            {ytSource && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                Nguồn: {ytSource}
              </span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runYoutubeSearch();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="text"
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              placeholder="Nhập chủ đề (VD: Merge Sort chia để trị) hoặc dán link YouTube..."
              className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
                {(
                  [
                    { key: "all", label: "Tất cả" },
                    { key: "vi", label: "Tiếng Việt" },
                    { key: "en", label: "English" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setYtLang(opt.key);
                      if (ytQuery.trim()) {
                        void runYoutubeSearch(ytQuery, opt.key);
                      }
                    }}
                    className={`rounded-md px-2.5 py-1.5 transition ${
                      ytLang === opt.key
                        ? "bg-white text-slate-900 shadow-sm font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={ytLoading || !ytQuery.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {ytLoading ? "Đang tìm..." : "Tìm trên YouTube"}
              </button>
            </div>
          </form>

          {/* Gợi ý từ khóa nhanh từ nội dung bài */}
          {baseSuggestedQuery && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500">Gợi ý tìm nhanh:</span>
              {[
                baseSuggestedQuery,
                `${baseSuggestedQuery} giải thích`,
                `${baseSuggestedQuery} visualization`,
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setYtQuery(preset);
                    void runYoutubeSearch(preset);
                  }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition"
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          {ytError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {ytError}
            </div>
          )}

          {ytLoading && (
            <div className="py-12 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
              <p className="mt-2 text-xs">Đang tìm kiếm video phù hợp trên YouTube...</p>
            </div>
          )}

          {!ytLoading && ytHasSearched && !ytError && ytItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
              Không tìm thấy kết quả YouTube phù hợp. Hãy thử rút gọn từ khóa hoặc dán trực tiếp link YouTube.
            </div>
          )}

          {!ytLoading && ytItems.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ytItems.map((item) => {
                const isAttaching = attachingYtId === item.videoId;
                const isAttached = attachedYtId === item.videoId;
                return (
                  <div
                    key={item.videoId}
                    className={`flex flex-col justify-between overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${
                      isAttached ? "border-emerald-500 ring-2 ring-emerald-400" : "border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="relative aspect-video w-full bg-slate-900 overflow-hidden group/yt">
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setYtStartInput("");
                            setYtEndInput("");
                            setPreviewYoutube(item);
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover/yt:opacity-100 transition text-white text-xs font-semibold gap-1.5"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white shadow">
                            ▶
                          </span>
                          Xem thử &amp; Cắt đoạn
                        </button>
                        {item.durationText && (
                          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                            {item.durationText}
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 space-y-1.5">
                        <h5 className="text-sm font-semibold text-slate-900 line-clamp-2" title={item.title}>
                          {item.title}
                        </h5>
                        <p className="text-xs font-medium text-slate-600 truncate">
                          {item.channelTitle}
                        </p>
                        {(item.viewCountText || item.publishedText) && (
                          <p className="text-[11px] text-slate-400">
                            {[item.viewCountText, item.publishedText].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {item.descriptionSnippet && (
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {item.descriptionSnippet}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 bg-slate-50 px-3.5 py-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setYtStartInput("");
                          setYtEndInput("");
                          setPreviewYoutube(item);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
                      >
                        ▶ Xem thử
                      </button>
                      <button
                        type="button"
                        disabled={isAttaching || !onAttachYoutube}
                        onClick={() => void handleAttachYoutubeItem(item)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                          isAttached
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                        }`}
                      >
                        {isAttaching
                          ? "Đang gắn..."
                          : isAttached
                            ? "✓ Đã gắn vào bài"
                            : "+ Gắn vào bài học"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(!microContentId || pickerTab === "LIBRARY") && (
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
                        {video.source_type === "YOUTUBE" && getAssetYoutubeThumbnail(video) ? (
                          <img
                            src={getAssetYoutubeThumbnail(video)!}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={`/api/videos/${video.asset_id}/stream?sid=${encodeURIComponent(sid)}`}
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        )}
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
                          : video.source_type === "YOUTUBE"
                            ? "bg-rose-600 text-white"
                            : "bg-indigo-600 text-white"
                      }`}
                    >
                      {video.source_type === "AI_STUDIO"
                        ? "AI Studio"
                        : video.source_type === "YOUTUBE"
                          ? "YouTube"
                          : "Upload"}
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
                      <span className="truncate pr-2">
                        {video.source_type === "YOUTUBE" && video.ai_options?.channelTitle
                          ? `Kênh: ${video.ai_options.channelTitle}`
                          : video.creatorName || "Ẩn danh"}
                      </span>
                      <span>
                        {video.source_type === "YOUTUBE"
                          ? "Nguồn: YouTube"
                          : `Dung lượng: ${formatBytes(video.size_bytes)}`}
                      </span>
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
              {previewAsset.source_type === "YOUTUBE" && getAssetYoutubeEmbedUrl(previewAsset) ? (
                <iframe
                  src={getAssetYoutubeEmbedUrl(previewAsset)!}
                  title={previewAsset.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  src={`/api/videos/${previewAsset.asset_id}/stream?sid=${encodeURIComponent(sid)}`}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* YouTube Preview & Trim Modal */}
      {previewYoutube && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-semibold truncate">{previewYoutube.title}</h3>
                <p className="text-[11px] text-slate-300 truncate">
                  {previewYoutube.channelTitle}
                  {previewYoutube.durationText ? ` · ${previewYoutube.durationText}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewYoutube(null)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={buildYoutubePreviewEmbedUrl(
                  previewYoutube.videoId,
                  ytStartInput,
                  ytEndInput,
                )}
                title={previewYoutube.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Bắt đầu từ (giây, tùy chọn)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={ytStartInput}
                    onChange={(e) => setYtStartInput(e.target.value)}
                    placeholder="VD: 30"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Kết thúc tại (giây, tùy chọn)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={ytEndInput}
                    onChange={(e) => setYtEndInput(e.target.value)}
                    placeholder="VD: 180"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={previewYoutube.watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    YouTube ↗
                  </a>
                  <button
                    type="button"
                    disabled={attachingYtId === previewYoutube.videoId || !onAttachYoutube}
                    onClick={() => {
                      const s = ytStartInput.trim() ? parseInt(ytStartInput.trim(), 10) : undefined;
                      const e = ytEndInput.trim() ? parseInt(ytEndInput.trim(), 10) : undefined;
                      void handleAttachYoutubeItem(previewYoutube, {
                        startSec: s !== undefined && Number.isFinite(s) && s >= 0 ? s : undefined,
                        endSec: e !== undefined && Number.isFinite(e) && e > 0 ? e : undefined,
                      });
                    }}
                    className="rounded-md bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {attachingYtId === previewYoutube.videoId
                      ? "Đang gắn..."
                      : "✓ Gắn vào bài học"}
                  </button>
                </div>
              </div>
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

