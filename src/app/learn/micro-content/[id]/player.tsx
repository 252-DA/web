"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SceneTimelineItem {
  scene_index: number;
  title: string;
  start_ms: number;
  end_ms: number;
  duration_ms?: number;
}

interface Props {
  microContentId: string;
  sid: string;
  title: string;
  durationMs: number | null;
  hasSubtitles?: boolean;
  sceneTimeline?: SceneTimelineItem[];
  transcriptText?: string | null;
  onProgressUpdate?: (data: { watchedPercent: number; unlocked: boolean }) => void;
}

function formatTimestamp(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MicroContentPlayer({
  microContentId,
  sid,
  hasSubtitles = false,
  sceneTimeline = [],
  transcriptText = null,
  onProgressUpdate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastHeartbeatRef = useRef<number>(0);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const [currentMs, setCurrentMs] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate;
  }, [onProgressUpdate]);

  const sendProgress = useCallback(
    async (positionMs: number) => {
      try {
        const res = await fetch(
          `/api/micro-content/${microContentId}/progress?sid=${encodeURIComponent(sid)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionMs }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          if (onProgressUpdateRef.current) {
            onProgressUpdateRef.current({
              watchedPercent: data.watchedPercent,
              unlocked: data.unlocked,
            });
          }
        }
      } catch {
        // Bỏ qua lỗi heartbeat để không làm gián đoạn việc xem
      }
    },
    [microContentId, sid],
  );

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) return;

    const positionMs = Math.round(video.currentTime * 1000);
    setCurrentMs(positionMs);

    const now = Date.now();
    // Gửi heartbeat mỗi ~10 giây chỉ khi video thực sự đang phát
    if (now - lastHeartbeatRef.current >= 10000) {
      lastHeartbeatRef.current = now;
      sendProgress(positionMs);
    }
  };

  const handlePauseOrEnd = () => {
    const video = videoRef.current;
    if (!video) return;
    const positionMs = Math.round(video.currentTime * 1000);
    setCurrentMs(positionMs);
    sendProgress(positionMs);
  };

  const handleSeekTo = (startMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, startMs / 1000);
    setCurrentMs(startMs);
    void video.play().catch(() => undefined);
  };

  // Khởi tạo heartbeat ban đầu để lấy trạng thái tiến độ hiện tại
  useEffect(() => {
    void sendProgress(0);
  }, [sendProgress]);

  const sortedTimeline = [...sceneTimeline].sort((a, b) => a.start_ms - b.start_ms);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-black shadow-lg aspect-video">
        <video
          ref={videoRef}
          controls
          controlsList="nodownload"
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePauseOrEnd}
          onEnded={handlePauseOrEnd}
          className="w-full h-full object-contain"
          src={`/api/micro-content/${microContentId}/video?sid=${encodeURIComponent(sid)}`}
        >
          {hasSubtitles && (
            <track
              kind="subtitles"
              src={`/api/micro-content/${microContentId}/subtitles?sid=${encodeURIComponent(sid)}`}
              srcLang="vi"
              label="Tiếng Việt"
              default
            />
          )}
          <p className="p-4 text-white text-sm text-center">
            Trình duyệt của bạn không hỗ trợ phát trực tiếp video này.
          </p>
        </video>
      </div>

      {(sortedTimeline.length > 0 || transcriptText) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {sortedTimeline.length > 0 ? "Các cảnh trong video" : "Nội dung lời giảng"}
            </span>
            {transcriptText && (
              <button
                type="button"
                onClick={() => setShowTranscript((prev) => !prev)}
                className="text-xs font-medium text-sky-600 hover:text-sky-800"
              >
                {showTranscript ? "Ẩn lời giảng" : "Xem lời giảng đầy đủ"}
              </button>
            )}
          </div>

          {sortedTimeline.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sortedTimeline.map((scene) => {
                const isActive =
                  currentMs >= scene.start_ms &&
                  (scene.end_ms > scene.start_ms ? currentMs < scene.end_ms : true);
                return (
                  <button
                    key={`${scene.scene_index}-${scene.start_ms}`}
                    type="button"
                    onClick={() => handleSeekTo(scene.start_ms)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                      isActive
                        ? "border-sky-500 bg-sky-50 text-sky-900 font-semibold"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                      {formatTimestamp(scene.start_ms)}
                    </span>
                    {scene.title}
                  </button>
                );
              })}
            </div>
          )}

          {showTranscript && transcriptText && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap border border-slate-100">
              {transcriptText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
