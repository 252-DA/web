"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MediaLibraryClient, VideoAsset } from "@/app/manage/media/media-library-client";

export interface VoiceOption {
  id: string;
  name: string;
  gender: "Nữ" | "Nam";
  lang: string;
  badge?: string;
  desc: string;
  sampleText: string;
}

export const AVAILABLE_VOICES: VoiceOption[] = [
  {
    id: "vi-VN-HoaiMyNeural",
    name: "Hoài My",
    gender: "Nữ",
    lang: "Tiếng Việt",
    badge: "Khuyên dùng",
    desc: "Giọng nữ nhẹ nhàng, truyền cảm (Miền Bắc / Phổ thông)",
    sampleText: "Xin chào các bạn, chào mừng các bạn đến với bài học hôm nay.",
  },
  {
    id: "vi-VN-NamMinhNeural",
    name: "Nam Minh",
    gender: "Nam",
    lang: "Tiếng Việt",
    badge: "Phổ biến",
    desc: "Giọng nam dõng dạc, trầm ấm (Miền Bắc / Phổ thông)",
    sampleText: "Chào mừng các bạn đã quay trở lại với khóa học của chúng ta.",
  },
  {
    id: "en-US-JennyNeural",
    name: "Jenny",
    gender: "Nữ",
    lang: "English (US)",
    badge: "Chuẩn Mỹ",
    desc: "Natural, expressive American female voice",
    sampleText: "Hello everyone, and welcome to this micro learning session.",
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy",
    gender: "Nam",
    lang: "English (US)",
    desc: "Warm and professional American male voice",
    sampleText: "Welcome to this course. Today we will explore key concepts.",
  },
  {
    id: "en-US-AriaNeural",
    name: "Aria",
    gender: "Nữ",
    lang: "English (US)",
    desc: "Clear and authoritative voice for education",
    sampleText: "Let us examine the fundamental principles in detail.",
  },
];

interface SceneCheck {
  status?: "VERIFIED" | "FLAGGED" | "INCONCLUSIVE" | "UNVERIFIED";
  reason?: string | null;
  notes?: string | null;
  regeneration_attempts?: number;
}

interface Scene {
  title: string;
  bullets: string[];
  narration: string;
  voice?: string;
  slide_page?: number;
  source_pages?: number[];
  check?: SceneCheck;
}

interface Script {
  language?: string;
  topic?: string;
  voice?: string;
  scenes: Scene[];
}

interface Props {
  microContent: {
    id: string;
    courseId?: string;
    videoAssetId?: string | null;
    videoSource: string;
    videoStatus: string;
    videoDurationMs: number | null;
    videoError: string | null;
    aiPrompt?: string | null;
    lowText?: boolean;
    aiScript?: Script | null;
    sourceDocumentId?: string | null;
    sourceDocumentTitle?: string | null;
    sourceDocumentTotalPages?: number | null;
    sourcePageFrom?: number | null;
    sourcePageTo?: number | null;
    loCode?: string | null;
    scriptStatus?: string;
    scriptError?: string | null;
    hasSubtitles?: boolean;
    sceneTimeline?: Array<{ scene_index: number; title: string; start_ms: number; end_ms: number }>;
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
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const scriptEditorRef = useRef<HTMLDivElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [source, setSource] = useState<"UPLOAD" | "AI" | "LIBRARY">(
    microContent.videoSource === "AI"
      ? "AI"
      : microContent.videoAssetId
      ? "LIBRARY"
      : (microContent.videoSource as "UPLOAD" | "AI") || "UPLOAD",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // AI Script states
  const [aiMode, setAiMode] = useState<"SLIDE" | "PDF" | "PROMPT">(
    microContent.sourceDocumentId ? "SLIDE" : "PDF",
  );
  const [prompt, setPrompt] = useState(microContent.aiPrompt || "");
  const [script, setScript] = useState<Script | null>(
    microContent.aiScript || null,
  );
  const [scriptStatus, setScriptStatus] = useState<string>(
    microContent.scriptStatus || (microContent.aiScript ? "READY" : "NONE"),
  );
  const [scriptError, setScriptError] = useState<string | null>(
    microContent.scriptError || null,
  );
  const [confirmFlagged, setConfirmFlagged] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(
    microContent.aiScript?.voice || "vi-VN-HoaiMyNeural",
  );
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);

  const [generatingScript, setGeneratingScript] = useState(
    microContent.scriptStatus === "GENERATING",
  );
  const [savingScript, setSavingScript] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // PDF to Script states
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(20);
  const [targetScenes, setTargetScenes] = useState<number>(5);
  const [extractingPdf, setExtractingPdf] = useState(false);

  // Polling script generation when GENERATING
  useEffect(() => {
    if (scriptStatus !== "GENERATING") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/micro-content/${microContent.id}?sid=${encodeURIComponent(sid)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const fresh = await res.json();
        if (fresh.scriptStatus && fresh.scriptStatus !== "GENERATING") {
          setScriptStatus(fresh.scriptStatus);
          setGeneratingScript(false);
          if (fresh.aiScript) {
            setScript(fresh.aiScript);
            setConfirmFlagged(false);
          }
          setScriptError(fresh.scriptError || null);
          if (fresh.scriptStatus === "READY") {
            setSaveSuccessMessage("Đã sinh và kiểm chứng xong kịch bản từ slide nguồn!");
          } else if (fresh.scriptStatus === "FAILED") {
            setError(fresh.scriptError || "Sinh kịch bản từ slide thất bại.");
          }
          router.refresh();
        }
      } catch {
        // Bỏ qua lỗi mạng thoáng qua
      }
    };

    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scriptStatus, microContent.id, sid, router]);

  // Polling when processing video
  useEffect(() => {
    if (microContent.videoStatus === "PROCESSING" || microContent.videoStatus === "UPLOADING") {
      const timer = setInterval(() => {
        router.refresh();
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [microContent.videoStatus, router]);

  // Clean up audio preview on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
    };
  }, []);

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoice(voiceId);
    if (script) {
      setScript({ ...script, voice: voiceId });
    }
  };

  const handlePreviewVoice = async (voiceId: string, sampleText: string) => {
    if (previewingVoice === voiceId) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setPreviewingVoice(null);
      return;
    }

    setPreviewLoading(voiceId);
    setError(null);

    try {
      const res = await fetch(`/api/videos/tts-preview?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: voiceId, text: sampleText }),
      });

      const data = await res.json();
      if (!res.ok || !data.audio_base64) {
        throw new Error(data.error || "Không thể tải giọng đọc nghe thử.");
      }

      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }

      const audioUrl = `data:audio/mpeg;base64,${data.audio_base64}`;
      setCurrentAudioSrc(audioUrl);

      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      audioPreviewRef.current = audio;

      audio.onended = () => {
        setPreviewingVoice(null);
      };
      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        setPreviewingVoice(null);
      };

      setPreviewingVoice(voiceId);
      try {
        await audio.play();
      } catch (playErr) {
        console.warn("audio.play() prevented by browser policy:", playErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi khi phát giọng nghe thử.");
      setPreviewingVoice(null);
    } finally {
      setPreviewLoading(null);
    }
  };

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

  const handleAttachVideo = async (asset: VideoAsset) => {
    try {
      const res = await fetch(`/api/videos/attach?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          microContentId: microContent.id,
          assetId: asset.asset_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gắn video vào bài giảng.");
      }
      setSaveSuccessMessage(`Đã gắn video "${asset.title}" vào bài học thành công.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    }
  };

  const handleGenerateScript = async () => {
    if (!microContent.sourceDocumentId) {
      setError(
        "Bài học chưa gắn bộ slide nguồn. Hãy quay lại danh sách Micro Content để tạo từ bộ slide hoặc dùng tab Tải PDF.",
      );
      return;
    }
    setGeneratingScript(true);
    setScriptStatus("GENERATING");
    setScriptError(null);
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
            prompt: prompt.trim() || undefined,
            options: { voice: selectedVoice },
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sinh kịch bản thất bại.");
      }

      setSaveSuccessMessage("Đã gửi yêu cầu sinh kịch bản từ slide nguồn...");
      router.refresh();
    } catch (err) {
      setGeneratingScript(false);
      setScriptStatus("FAILED");
      setError(err instanceof Error ? err.message : "Đã có lỗi khi sinh kịch bản.");
    }
  };

  const handleExtractPdf = async () => {
    if (!pdfFile) {
      setError("Vui lòng chọn file PDF bài giảng / slide.");
      return;
    }
    setExtractingPdf(true);
    setError(null);
    setSaveSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("startPage", String(startPage));
      formData.append("endPage", String(endPage));
      formData.append("targetScenes", String(targetScenes));
      formData.append("topic", pdfFile.name.replace(/\.pdf$/i, ""));

      const res = await fetch(`/api/videos/script-from-pdf?sid=${encodeURIComponent(sid)}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể trích xuất kịch bản từ file PDF.");
      }

      if (data.scenes && data.scenes.length > 0) {
        const newScript: Script = {
          language: "vi",
          topic: pdfFile.name.replace(/\.pdf$/i, ""),
          voice: selectedVoice,
          scenes: data.scenes,
        };
        setScript(newScript);
        setSaveSuccessMessage(
          `Đã trích xuất thành công ${data.scenes.length} cảnh từ file PDF "${pdfFile.name}"! Giảng viên hãy duyệt và chỉnh sửa bên dưới trước khi render video AI.`,
        );

        // Tự động lưu kịch bản này vào microContent
        try {
          await fetch(`/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_script",
              script: newScript,
            }),
          });
        } catch {
          // Ignored
        }

        setTimeout(() => {
          scriptEditorRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      } else {
        throw new Error("Không tìm thấy nội dung cảnh nào từ file PDF.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi khi trích xuất PDF.");
    } finally {
      setExtractingPdf(false);
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
      const scriptToSave = {
        ...script,
        voice: selectedVoice,
      };

      const res = await fetch(
        `/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_script",
            script: scriptToSave,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Lưu kịch bản thất bại.");
      }

      setSaveSuccessMessage("Đã lưu kịch bản và cấu hình giọng đọc thành công.");
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
      // Đảm bảo kịch bản đã lưu kèm voice mới nhất trước khi render
      if (script) {
        await fetch(
          `/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_script",
              script: { ...script, voice: selectedVoice },
            }),
          },
        );
      }

      const res = await fetch(
        `/api/micro-content/${microContent.id}/ai?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request_render",
            allowFlagged: confirmFlagged,
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

  const deleteScene = (idx: number) => {
    if (!script || script.scenes.length <= 1) return;
    const newScenes = script.scenes.filter((_, i) => i !== idx);
    setScript({ ...script, scenes: newScenes });
  };

  const addScene = () => {
    if (!script) return;
    const newScenes = [
      ...script.scenes,
      {
        title: `Cảnh ${script.scenes.length + 1}`,
        bullets: ["Ý chính cần nhấn mạnh"],
        narration: "Lời giảng giải chi tiết cho cảnh này.",
      },
    ];
    setScript({ ...script, scenes: newScenes });
  };

  const flaggedCount =
    script?.scenes?.filter((s) => s.check?.status === "FLAGGED").length ?? 0;

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
              {microContent.hasSubtitles && (
                <track
                  kind="subtitles"
                  src={`/api/micro-content/${microContent.id}/subtitles?sid=${encodeURIComponent(sid)}`}
                  srcLang="vi"
                  label="Tiếng Việt"
                  default
                />
              )}
              Trình duyệt của bạn không hỗ trợ thẻ video.
            </video>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Thời lượng: {formatDuration(microContent.videoDurationMs)} · Tua video hoạt động mượt mà qua HTTP Range Stream
            {microContent.hasSubtitles
              ? ` · Phụ đề WebVTT (${microContent.sceneTimeline?.length ?? 0} cảnh).`
              : "."}
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

      {/* Thẻ Chế độ nguồn Video */}
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
            ✨ Tạo video bằng AI (Slide + PDF + Giọng đọc)
          </button>
          <button
            type="button"
            onClick={() => setSource("LIBRARY")}
            className={`pb-2 text-sm font-medium transition ${
              source === "LIBRARY"
                ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            📚 Chọn từ Kho học liệu (Video DAM)
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

        {source === "UPLOAD" && (
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
        )}

        {source === "AI" && (
          <div className="mt-6 space-y-6">
            {/* Lựa chọn giọng đọc AI (TTS) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <span>🎙️</span> Giọng đọc giảng bài AI (TTS)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn giọng đọc phù hợp cho bài giảng. Bạn có thể bấm nút &quot;Nghe thử&quot; để cảm nhận ngữ điệu trước khi dựng video.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {AVAILABLE_VOICES.map((v) => {
                  const isSelected = selectedVoice === v.id;
                  const isPlaying = previewingVoice === v.id;
                  const isLoading = previewLoading === v.id;

                  return (
                    <div
                      key={v.id}
                      onClick={() => handleVoiceChange(v.id)}
                      className={`relative cursor-pointer rounded-xl border p-4 transition text-left flex flex-col justify-between ${
                        isSelected
                          ? "border-sky-600 bg-sky-50/50 shadow-sm ring-1 ring-sky-600"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                            {v.name}
                            <span className="text-[11px] font-normal text-slate-500">
                              ({v.gender} · {v.lang})
                            </span>
                          </span>
                          {v.badge && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                              {v.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                          {v.desc}
                        </p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewVoice(v.id, v.sampleText);
                          }}
                          disabled={isLoading}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            isPlaying
                              ? "bg-rose-50 text-rose-600 border border-rose-200"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {isLoading ? (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-r-transparent" />
                          ) : isPlaying ? (
                            <>
                              <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                              <span>Đang phát</span>
                            </>
                          ) : (
                            <>
                              <span>▶</span>
                              <span>Nghe thử</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="selectedVoice"
                            checked={isSelected}
                            onChange={() => handleVoiceChange(v.id)}
                            className="h-4 w-4 text-sky-600 focus:ring-sky-500"
                          />
                          <span className="text-xs font-medium text-slate-600">
                            {isSelected ? "Đã chọn" : "Chọn"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Thanh điều khiển phát âm thanh trực quan */}
              {currentAudioSrc && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50/80 p-3.5 border border-sky-200 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-600"></span>
                    </span>
                    <div>
                      <p className="text-xs font-bold text-sky-950">
                        Đang phát thử giọng: {AVAILABLE_VOICES.find((v) => v.id === previewingVoice)?.name || selectedVoice}
                      </p>
                      <p className="text-[11px] text-sky-700">
                        {AVAILABLE_VOICES.find((v) => v.id === (previewingVoice || selectedVoice))?.desc}
                      </p>
                    </div>
                  </div>
                  <audio
                    key={currentAudioSrc}
                    controls
                    autoPlay
                    src={currentAudioSrc}
                    className="h-9 w-full sm:w-72"
                    onEnded={() => setPreviewingVoice(null)}
                  />
                </div>
              )}
            </div>

            {/* Giai đoạn 1: Lựa chọn cách tạo kịch bản */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                  Giai đoạn 1: Nạp nội dung kịch bản
                </span>
                <div className="flex flex-wrap gap-2">
                  {microContent.sourceDocumentId && (
                    <button
                      type="button"
                      onClick={() => setAiMode("SLIDE")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        aiMode === "SLIDE"
                          ? "bg-sky-600 text-white shadow-sm"
                          : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      📚 Slide nguồn của bài
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAiMode("PDF")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      aiMode === "PDF"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    📄 Tải file PDF khác
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiMode("PROMPT")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      aiMode === "PROMPT"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    💡 Yêu cầu bổ sung
                  </button>
                </div>
              </div>

              {aiMode === "SLIDE" && microContent.sourceDocumentId ? (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white p-4">
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-900">
                        {microContent.sourceDocumentTitle || "Bộ slide bài giảng"}
                      </p>
                      <p className="text-slate-600">
                        Dải trang nguồn:{" "}
                        <strong>
                          Trang {microContent.sourcePageFrom || 1}–{microContent.sourcePageTo || microContent.sourcePageFrom || 1}
                        </strong>
                        {microContent.sourceDocumentTotalPages
                          ? ` / ${microContent.sourceDocumentTotalPages} trang`
                          : ""}
                        {microContent.loCode ? ` · LO chính: ${microContent.loCode}` : ""}
                        {microContent.lowText && (
                          <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                            Ít chữ
                          </span>
                        )}
                      </p>
                      <div className="pt-1">
                        <input
                          type="text"
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="Yêu cầu bổ sung cho AI (không bắt buộc), ví dụ: Nhấn mạnh ví dụ thực tế..."
                          className="w-full min-w-[260px] rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/documents/${microContent.sourceDocumentId}/file?sid=${encodeURIComponent(
                          sid,
                        )}#page=${microContent.sourcePageFrom || 1}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                      >
                        Mở trang slide ↗
                      </a>
                      <button
                        type="button"
                        onClick={handleGenerateScript}
                        disabled={generatingScript || scriptStatus === "GENERATING"}
                        className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        {generatingScript || scriptStatus === "GENERATING"
                          ? "Đang sinh kịch bản..."
                          : script
                          ? "Sinh lại kịch bản"
                          : "Sinh kịch bản"}
                      </button>
                    </div>
                  </div>
                  {scriptStatus === "GENERATING" && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-r-transparent" />
                      AI đang phân tích đúng dải trang slide nguồn, viết lời giảng và kiểm chứng độ bám nguồn...
                    </div>
                  )}
                  {scriptStatus === "FAILED" && scriptError && (
                    <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                      Sinh kịch bản gặp lỗi: {scriptError}
                    </div>
                  )}
                </div>
              ) : aiMode === "PDF" ? (
                <div className="space-y-4 pt-1">
                  <div className="rounded-lg border-2 border-dashed border-sky-300 bg-sky-50/40 p-6 text-center hover:bg-sky-50/70 transition">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setPdfFile(file);
                      }}
                      disabled={extractingPdf}
                      className="hidden"
                    />

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {pdfFile ? `Đã chọn: ${pdfFile.name} (${(pdfFile.size / (1024 * 1024)).toFixed(2)} MB)` : "Chọn file PDF slide hoặc tài liệu bài giảng"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Hệ thống tự động lọc tiêu đề theo cỡ chữ lớn nhất, loại bỏ Header/Footer rác và chuẩn hóa lời đọc TTS.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={extractingPdf}
                      onClick={() => pdfInputRef.current?.click()}
                      className="mt-3 inline-block rounded-lg border border-sky-600 bg-white px-4 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                    >
                      {pdfFile ? "Đổi file PDF khác" : "Chọn file PDF"}
                    </button>
                  </div>

                  {/* Tùy chọn Khoảng trang & Số cảnh mục tiêu */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg bg-white p-4 border border-slate-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Khoảng trang trích xuất (Slide)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Từ</span>
                        <input
                          type="number"
                          min={1}
                          value={startPage}
                          onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs text-center focus:border-sky-500 focus:outline-none"
                        />
                        <span className="text-xs text-slate-500">Đến</span>
                        <input
                          type="number"
                          min={startPage}
                          value={endPage}
                          onChange={(e) => setEndPage(Math.max(startPage, parseInt(e.target.value) || 20))}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs text-center focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Mặc định đọc 20 trang đầu; giúp tránh bị loãng kiến thức khi slide quá dài.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Số cảnh mục tiêu (Scenes)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={2}
                          max={10}
                          value={targetScenes}
                          onChange={(e) => setTargetScenes(Math.min(10, Math.max(2, parseInt(e.target.value) || 5)))}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs text-center focus:border-sky-500 focus:outline-none"
                        />
                        <span className="text-xs text-slate-500">cảnh (khuyến nghị: 4 - 6 cảnh)</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Mỗi cảnh tương ứng với 1 slide và 25-45 giây giảng giải súc tích.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExtractPdf}
                    disabled={extractingPdf || !pdfFile}
                    className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2"
                  >
                    {extractingPdf ? (
                      <>
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" />
                        Đang phân tích cấu trúc PDF và tạo kịch bản...
                      </>
                    ) : (
                      "🪄 Trích xuất kịch bản từ PDF vào Trình duyệt kịch bản"
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
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
                    disabled={generatingScript || scriptStatus === "GENERATING" || !microContent.sourceDocumentId}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {generatingScript || scriptStatus === "GENERATING"
                      ? "Đang sinh kịch bản..."
                      : "Sinh kịch bản"}
                  </button>
                  {!microContent.sourceDocumentId && (
                    <p className="text-[11px] text-amber-700">
                      Bài học này chưa gắn bộ slide nguồn nên không thể sinh kịch bản AI bám slide; hãy dùng tab &ldquo;Tải file PDF khác&rdquo; hoặc tạo từ bộ slide ở trang danh sách.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Giai đoạn 2: Xem và chỉnh sửa kịch bản (Human-in-the-loop) */}
            <div ref={scriptEditorRef} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Giai đoạn 2: Duyệt & Chỉnh sửa kịch bản {script?.scenes ? `(${script.scenes.length} cảnh)` : ""}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Giảng viên có toàn quyền hiệu chỉnh tiêu đề, ý chính và văn phong đọc thành tiếng trước khi xuất video MP4.
                  </p>
                </div>
                {script && script.scenes && script.scenes.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addScene}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      + Thêm cảnh
                    </button>
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
                      disabled={
                        renderingVideo ||
                        microContent.videoStatus === "PROCESSING" ||
                        (flaggedCount > 0 && !confirmFlagged)
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                    >
                      {microContent.videoStatus === "PROCESSING"
                        ? "Đang render video..."
                        : "Dựng video AI"}
                    </button>
                  </div>
                )}
              </div>

              {flaggedCount > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2">
                  <p className="font-semibold">
                    ⚠ Kịch bản có {flaggedCount} cảnh chưa kiểm chứng được hoàn toàn trên slide nguồn.
                  </p>
                  <p>
                    Vui lòng đối chiếu các cảnh được đánh dấu bên dưới với slide gốc và chỉnh sửa nếu cần trước khi dựng video.
                  </p>
                  <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmFlagged}
                      onChange={(e) => setConfirmFlagged(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600"
                    />
                    <span>Tôi đã kiểm tra và vẫn xác nhận dựng video AI</span>
                  </label>
                </div>
              )}

              {script && script.scenes && script.scenes.length > 0 ? (
                <div className="space-y-4">
                  {script.scenes.map((scene, idx) => {
                    const isFlagged = scene.check?.status === "FLAGGED";
                    const isVerified = scene.check?.status === "VERIFIED";
                    return (
                    <div
                      key={idx}
                      className={`rounded-xl border bg-white p-5 shadow-sm space-y-3 ${
                        isFlagged
                          ? "border-amber-300 ring-1 ring-amber-200"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-sky-600 uppercase">
                            Cảnh {idx + 1}
                          </span>
                          {isVerified && (
                            <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              ✓ Bám nguồn
                            </span>
                          )}
                          {isFlagged && (
                            <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                              ⚠ Cần kiểm tra nguồn
                            </span>
                          )}
                          {(Array.isArray(scene.source_pages) && scene.source_pages.length > 0
                            ? scene.source_pages
                            : typeof scene.slide_page === "number"
                            ? [scene.slide_page]
                            : []
                          ).map((pageNo) =>
                            microContent.sourceDocumentId ? (
                                <a
                                  key={pageNo}
                                  href={`/api/documents/${microContent.sourceDocumentId}/file?sid=${encodeURIComponent(
                                    sid,
                                  )}#page=${pageNo}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-sky-700 hover:bg-sky-50"
                                >
                                  Trang {pageNo} ↗
                                </a>
                              ) : (
                                <span
                                  key={pageNo}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                                >
                                  Trang {pageNo}
                                </span>
                              ),
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Cho phép chọn giọng riêng cho cảnh này nếu muốn */}
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span>Giọng cảnh:</span>
                            <select
                              value={scene.voice || ""}
                              onChange={(e) => updateScene(idx, { voice: e.target.value || undefined })}
                              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-sky-500 focus:outline-none"
                            >
                              <option value="">Theo giọng chung ({AVAILABLE_VOICES.find((v) => v.id === selectedVoice)?.name || selectedVoice})</option>
                              {AVAILABLE_VOICES.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} ({v.gender})
                                </option>
                              ))}
                            </select>
                          </div>
                          {script.scenes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => deleteScene(idx)}
                              className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                            >
                              Xóa cảnh
                            </button>
                          )}
                        </div>
                      </div>

                      {isFlagged && (scene.check?.reason || scene.check?.notes) && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                          Lý do gắn cờ: {scene.check.reason || scene.check.notes}
                        </div>
                      )}

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
                          Ý chính trên slide (mỗi dòng một ý - giữ nguyên công thức/ký hiệu kỹ thuật)
                        </label>
                        <textarea
                          rows={3}
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
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">
                            Lời đọc thành tiếng (TTS - đã chuẩn hóa các ký hiệu & từ viết tắt sang văn nói)
                          </label>
                          <button
                            type="button"
                            onClick={() => handlePreviewVoice(scene.voice || selectedVoice, scene.narration)}
                            className="text-[11px] font-medium text-sky-600 hover:text-sky-800 flex items-center gap-1"
                          >
                            <span>▶</span> Nghe thử cảnh này
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={scene.narration}
                          onChange={(e) => updateScene(idx, { narration: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none font-sans"
                        />
                      </div>
                    </div>
                  );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
                  Chưa có kịch bản. Giảng viên vui lòng tải lên file PDF bài giảng hoặc nhập chủ đề ở Giai đoạn 1 để bắt đầu.
                </div>
              )}
            </div>
          </div>
        )}

        {source === "LIBRARY" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 text-xs text-indigo-900">
              💡 <strong>Kho học liệu Video dùng chung</strong>: Chọn bất kỳ video nào từ kho lưu trữ (tải lên hoặc AI sinh) để gắn vào bài học này. Dung lượng lưu trữ trên MinIO được tái sử dụng 100%, không cần tải lên hay render lại!
            </div>
            <MediaLibraryClient
              sid={sid}
              courseId={microContent.courseId || ""}
              onSelectVideo={handleAttachVideo}
              selectedAssetId={microContent.videoAssetId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
