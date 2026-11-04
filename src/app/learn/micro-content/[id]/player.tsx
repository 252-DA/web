"use client";

import { useEffect, useRef } from "react";

interface Props {
  microContentId: string;
  sid: string;
  title: string;
  durationMs: number | null;
  onProgressUpdate?: (data: { watchedPercent: number; unlocked: boolean }) => void;
}

export function MicroContentPlayer({
  microContentId,
  sid,
  onProgressUpdate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastHeartbeatRef = useRef<number>(0);

  const sendProgress = async (positionMs: number) => {
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
        if (onProgressUpdate) {
          onProgressUpdate({
            watchedPercent: data.watchedPercent,
            unlocked: data.unlocked,
          });
        }
      }
    } catch {
      // Bỏ qua lỗi heartbeat để không làm gián đoạn việc xem
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const now = Date.now();
    // Gửi heartbeat mỗi ~10 giây khi đang phát
    if (now - lastHeartbeatRef.current >= 10000) {
      lastHeartbeatRef.current = now;
      const positionMs = Math.round(video.currentTime * 1000);
      sendProgress(positionMs);
    }
  };

  const handlePauseOrEnd = () => {
    const video = videoRef.current;
    if (!video) return;
    const positionMs = Math.round(video.currentTime * 1000);
    sendProgress(positionMs);
  };

  // Khởi tạo heartbeat ban đầu để lấy trạng thái tiến độ hiện tại
  useEffect(() => {
    sendProgress(0);
  }, [microContentId]);

  return (
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
        <p className="p-4 text-white text-sm text-center">
          Trình duyệt của bạn không hỗ trợ phát trực tiếp video này.
        </p>
      </video>
    </div>
  );
}
