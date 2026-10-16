"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  microContent: {
    id: string;
    videoSource: string;
    videoStatus: string;
    videoDurationMs: number | null;
    videoError: string | null;
  };
  sid: string;
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VideoPanel({ microContent, sid }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"UPLOAD" | "AI">(
    (microContent.videoSource as "UPLOAD" | "AI") || "UPLOAD",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024 * 1024) {
      setError("File quá lớn. Kích thước tối đa là 500 MB.");
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      // Đọc duration từ file qua thẻ video tạm
      let durationMs = 0;
      try {
        const videoElement = document.createElement("video");
        videoElement.preload = "metadata";
        videoElement.src = URL.createObjectURL(file);
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

      setUploadProgress(30);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("durationMs", String(durationMs));

      const res = await fetch(
        `/api/micro-content/${microContent.id}/upload?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          body: formData,
        },
      );

      setUploadProgress(90);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Tải video lên thất bại");
      }

      setUploadProgress(100);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Video Preview nếu đã sẵn sàng */}
      {microContent.videoStatus === "READY" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Xem thử Video đã sẵn sàng</h3>
          <div className="overflow-hidden rounded-lg bg-black aspect-video max-w-2xl">
            <video
              controls
              className="w-full h-full"
              src={`/api/micro-content/${microContent.id}/video?sid=${encodeURIComponent(sid)}`}
            >
              Trình duyệt của bạn không hỗ trợ thẻ video.
            </video>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Thời lượng: {formatDuration(microContent.videoDurationMs)} · Tua video hoạt động mượt mà qua HTTP Range Stream.
          </p>
        </div>
      )}

      {/* Trạng thái Video hiện tại */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Trạng thái Video</h3>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              microContent.videoStatus === "READY"
                ? "bg-emerald-500"
                : microContent.videoStatus === "PROCESSING" ||
                  microContent.videoStatus === "UPLOADING"
                ? "bg-amber-500 animate-pulse"
                : microContent.videoStatus === "FAILED"
                ? "bg-rose-500"
                : "bg-slate-300"
            }`}
          />
          <span className="text-sm font-medium text-slate-700">
            {microContent.videoStatus === "READY"
              ? `Đã sẵn sàng (${formatDuration(microContent.videoDurationMs)})`
              : microContent.videoStatus === "PROCESSING"
              ? "Đang xử lý/render video..."
              : microContent.videoStatus === "UPLOADING"
              ? "Đang tải file lên..."
              : microContent.videoStatus === "FAILED"
              ? "Xử lý video thất bại"
              : "Chưa có video"}
          </span>
        </div>
        {microContent.videoError && (
          <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
            {microContent.videoError}
          </div>
        )}
      </div>

      {/* Thẻ Upload / AI */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex gap-4 border-b border-slate-100 pb-4">
          <button
            type="button"
            onClick={() => setSource("UPLOAD")}
            className={`pb-2 text-sm font-medium transition ${
              source === "UPLOAD"
                ? "border-b-2 border-sky-600 text-sky-600 font-semibold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Tải lên video (MP4 / WebM)
          </button>
          <button
            type="button"
            onClick={() => setSource("AI")}
            className={`pb-2 text-sm font-medium transition ${
              source === "AI"
                ? "border-b-2 border-sky-600 text-sky-600 font-semibold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Tạo video bằng AI
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
            {error}
          </div>
        )}

        {source === "UPLOAD" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-slate-400">
              <p className="text-sm font-medium text-slate-700">
                Kéo thả file video vào đây hoặc chọn từ máy tính
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Định dạng hỗ trợ: MP4, WebM (H.264/AAC khuyến nghị). Dung lượng tối đa: 500 MB.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 inline-block rounded-lg bg-sky-600 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {uploading ? `Đang tải lên (${uploadProgress}%)...` : "Chọn file video để tải"}
              </button>

              {uploading && (
                <div className="mt-4 w-full bg-slate-100 rounded-full h-2.5 max-w-md mx-auto overflow-hidden">
                  <div
                    className="bg-sky-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Chủ đề hoặc nội dung cần giảng giải
              </label>
              <textarea
                rows={4}
                placeholder="Ví dụ: Giảng giải trực quan thuật toán QuickSort, phân vùng Lomuto và độ phức tạp O(n log n)..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <button
              type="button"
              disabled
              className="rounded-lg bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-500"
            >
              Sinh kịch bản bằng AI (Sẽ kích hoạt ở Mốc 5)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
