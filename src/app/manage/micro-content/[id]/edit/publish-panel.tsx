"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  microContent: {
    id: string;
    title: string;
    description: string | null;
    passingScore: number;
    requiredWatchPercent: number;
    status: string;
    videoStatus: string;
    questions: any[];
  };
  sid: string;
}

export function PublishPanel({ microContent, sid }: Props) {
  const router = useRouter();
  const [passingScore, setPassingScore] = useState(microContent.passingScore);
  const [requiredWatchPercent, setRequiredWatchPercent] = useState(
    microContent.requiredWatchPercent,
  );
  const [status, setStatus] = useState(microContent.status);
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const canPublish =
    microContent.videoStatus === "READY" && microContent.questions.length > 0;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/micro-content/${microContent.id}?sid=${encodeURIComponent(sid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passingScore, requiredWatchPercent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu cài đặt");
      setMessage({ text: "Đã cập nhật cài đặt thành công!", type: "success" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        type: "error",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTogglePublish = async () => {
    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/micro-content/${microContent.id}/publish?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể thay đổi trạng thái xuất bản");
      setStatus(data.status);
      setMessage({
        text:
          data.status === "PUBLISHED"
            ? "Đã xuất bản thành công! Học viên có thể truy cập."
            : "Đã chuyển về bản nháp.",
        type: "success",
      });
      router.refresh();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Đã có lỗi xảy ra",
        type: "error",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg p-4 text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Cài đặt điều kiện */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
      >
        <h3 className="text-base font-semibold text-slate-900">Thiết lập điều kiện hoàn thành</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Điểm đạt yêu cầu (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Tỷ lệ xem video tối thiểu (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={requiredWatchPercent}
              onChange={(e) => setRequiredWatchPercent(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingSettings}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {savingSettings ? "Đang lưu..." : "Lưu cài đặt"}
          </button>
        </div>
      </form>

      {/* Kiểm tra điều kiện xuất bản */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Điều kiện xuất bản</h3>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${
                microContent.videoStatus === "READY" ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              {microContent.videoStatus === "READY" ? "✓" : "!"}
            </span>
            <span className={microContent.videoStatus === "READY" ? "text-slate-800" : "text-slate-500"}>
              Video đã sẵn sàng (READY) — hiện tại: {microContent.videoStatus}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${
                microContent.questions.length > 0 ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              {microContent.questions.length > 0 ? "✓" : "!"}
            </span>
            <span
              className={microContent.questions.length > 0 ? "text-slate-800" : "text-slate-500"}
            >
              Có ít nhất 1 câu hỏi củng cố — hiện tại: {microContent.questions.length} câu hỏi
            </span>
          </li>
        </ul>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Trạng thái hiện tại</p>
            <p className="text-sm font-semibold text-slate-900">
              {status === "PUBLISHED" ? "🟢 Đang xuất bản (PUBLISHED)" : "⚪ Bản nháp (DRAFT)"}
            </p>
          </div>
          <button
            type="button"
            disabled={publishing || (!canPublish && status !== "PUBLISHED")}
            onClick={handleTogglePublish}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-40 ${
              status === "PUBLISHED"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {publishing
              ? "Đang xử lý..."
              : status === "PUBLISHED"
              ? "Thu hồi về bản nháp"
              : "Xuất bản Micro Content"}
          </button>
        </div>
      </div>
    </div>
  );
}
