"use client";

import { useState } from "react";

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

export function VideoPanel({ microContent }: Props) {
  const [source, setSource] = useState<"UPLOAD" | "AI">(
    (microContent.videoSource as "UPLOAD" | "AI") || "UPLOAD",
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Trạng thái Video hiện tại</h3>
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

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex gap-4 border-b border-slate-100 pb-4">
          <button
            type="button"
            onClick={() => setSource("UPLOAD")}
            className={`pb-2 text-sm font-medium transition ${
              source === "UPLOAD"
                ? "border-b-2 border-sky-600 text-sky-600"
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
                ? "border-b-2 border-sky-600 text-sky-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Tạo video bằng AI
          </button>
        </div>

        {source === "UPLOAD" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-slate-400">
              <p className="text-sm text-slate-600">
                Kéo thả file video vào đây hoặc bấm để chọn file từ máy
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Chấp nhận file định dạng .mp4, .webm. Dung lượng tối đa: 500 MB.
              </p>
              <label className="mt-4 inline-block cursor-pointer rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700">
                Chọn file video
                <input type="file" accept="video/mp4,video/webm" className="hidden" />
              </label>
            </div>
            <p className="text-xs text-slate-500 italic">
              * Tính năng stream và xác thực video sẽ kích hoạt đầy đủ ở Mốc 2 (M2).
            </p>
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
              Sinh kịch bản bằng AI (Mốc 5)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

