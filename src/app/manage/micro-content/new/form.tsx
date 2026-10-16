"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateMicroContentForm({ sid }: { sid: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoSource, setVideoSource] = useState<"UPLOAD" | "AI">("UPLOAD");
  const [passingScore, setPassingScore] = useState(70);
  const [requiredWatchPercent, setRequiredWatchPercent] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Vui lòng nhập tiêu đề.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/micro-content?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          videoSource,
          passingScore,
          requiredWatchPercent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể tạo Micro Content");
      }

      router.push(`/manage/micro-content/${data.id}/edit?sid=${encodeURIComponent(sid)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {error && (
        <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700 border border-rose-200">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Tiêu đề <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Giới thiệu thuật toán sắp xếp nhanh (QuickSort)"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Mô tả (tuỳ chọn)</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả tóm tắt nội dung bài học..."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Nguồn video</label>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setVideoSource("UPLOAD")}
              className={`rounded-lg border p-4 text-left transition ${
                videoSource === "UPLOAD"
                  ? "border-sky-500 bg-sky-50/50 ring-2 ring-sky-200"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">Tự tải lên video</p>
              <p className="mt-1 text-xs text-slate-500">
                Tải file mp4 hoặc webm từ máy tính (tối đa 500 MB).
              </p>
            </button>
            <button
              type="button"
              onClick={() => setVideoSource("AI")}
              className={`rounded-lg border p-4 text-left transition ${
                videoSource === "AI"
                  ? "border-sky-500 bg-sky-50/50 ring-2 ring-sky-200"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">AI tự động tạo</p>
              <p className="mt-1 text-xs text-slate-500">
                Nhập chủ đề để AI sinh kịch bản, slide và lồng tiếng.
              </p>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Điểm đạt (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <p className="mt-1 text-xs text-slate-500">Điểm tối thiểu học viên cần để qua bài.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Yêu cầu xem video (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={requiredWatchPercent}
              onChange={(e) => setRequiredWatchPercent(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <p className="mt-1 text-xs text-slate-500">0% = không khoá câu hỏi.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? "Đang tạo..." : "Tiếp tục soạn nội dung →"}
          </button>
        </div>
      </div>
    </form>
  );
}

