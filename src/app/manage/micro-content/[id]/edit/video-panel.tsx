"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Scene {
  title: string;
  bullets: string[];
  narration: string;
}

interface Script {
  language?: string;
  topic?: string;
  scenes: Scene[];
}

interface Props {
  microContent: {
    id: string;
    videoSource: string;
    videoStatus: string;
    videoDurationMs: number | null;
    videoError: string | null;
    aiPrompt?: string | null;
    aiScript?: Script | null;
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

  // AI Script states
  const [prompt, setPrompt] = useState(microContent.aiPrompt || "");
  const [script, setScript] = useState<Script | null>(
    microContent.aiScript || null,
  );
  const [generatingScript, setGeneratingScript] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Polling when processing video
  useEffect(() => {
    if (microContent.videoStatus === "PROCESSING" || microContent.videoStatus === "UPLOADING") {
      const timer = setInterval(() => {
        router.refresh();
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [microContent.videoStatus, router]);

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

  const handleGenerateScript = async () => {
    if (!prompt.trim()) {
      setError("Vui lòng nhập chủ đề / nội dung giảng giải.");
      return;
    }
    setGeneratingScript(true);
    setError(null);
    setSaveSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request_script",
            prompt: prompt.trim(),
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sinh kịch bản thất bại.");
      }

      if (data.script) {
        setScript(data.script);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi khi sinh kịch bản.");
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleSaveScript = async () => {
    if (!script || !script.scenes || script.scenes.length === 0) {
      setError("Kịch bản phải có ít nhất 1 cảnh.");
      return;
    }
    setSavingScript(true);
    setError(null);
    setSaveSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_script",
            script,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Lưu kịch bản thất bại.");
      }

      setSaveSuccessMessage("Đã lưu kịch bản thành công.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi khi lưu kịch bản.");
    } finally {
      setSavingScript(false);
    }
  };

  const handleRequestRender = async () => {
    setRenderingVideo(true);
    setError(null);
    setSaveSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request_render",
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Yêu cầu render video thất bại.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi khi gửi yêu cầu render.");
    } finally {
      setRenderingVideo(false);
    }
  };

  const updateScene = (idx: number, updated: Partial<Scene>) => {
    if (!script) return;
    const newScenes = [...script.scenes];
    newScenes[idx] = { ...newScenes[idx], ...updated };
    setScript({ ...script, scenes: newScenes });
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
              ? "Đang xử lý/render video bằng AI (Vui lòng đợi vài phút)..."
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
            Tạo video bằng AI (Slide + Giọng đọc)
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
            {error}
          </div>
        )}
        {saveSuccessMessage && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
            {saveSuccessMessage}
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
          <div className="mt-6 space-y-6">
            {/* Nhập prompt sinh kịch bản */}
            <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
                Giai đoạn 1: Chủ đề / Yêu cầu giảng giải
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ví dụ: Giảng giải trực quan thuật toán QuickSort, phân vùng Lomuto và độ phức tạp O(n log n)..."
                className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={generatingScript}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {generatingScript ? "Đang tạo kịch bản..." : "Tạo / Đặt lại kịch bản"}
              </button>
            </div>

            {/* Xem và chỉnh sửa kịch bản */}
            {script && script.scenes && script.scenes.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Giai đoạn 2: Xem & Chỉnh sửa kịch bản ({script.scenes.length} cảnh)
                  </h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveScript}
                      disabled={savingScript}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {savingScript ? "Đang lưu..." : "Lưu kịch bản"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestRender}
                      disabled={renderingVideo || microContent.videoStatus === "PROCESSING"}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                    >
                      {microContent.videoStatus === "PROCESSING"
                        ? "Đang render video..."
                        : "Render Video bằng AI"}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {script.scenes.map((scene, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold text-sky-600 uppercase">
                          Cảnh {idx + 1}
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Tiêu đề Slide
                        </label>
                        <input
                          type="text"
                          value={scene.title}
                          onChange={(e) => updateScene(idx, { title: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Ý chính trên slide (mỗi dòng một ý)
                        </label>
                        <textarea
                          rows={2}
                          value={scene.bullets?.join("\n") || ""}
                          onChange={(e) =>
                            updateScene(idx, {
                              bullets: e.target.value.split("\n").filter((b) => b.trim()),
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Lời đọc thành tiếng (TTS)
                        </label>
                        <textarea
                          rows={3}
                          value={scene.narration}
                          onChange={(e) => updateScene(idx, { narration: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none font-sans"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
