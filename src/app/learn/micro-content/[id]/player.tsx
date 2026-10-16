"use client";

import { useRef } from "react";

interface Props {
  microContentId: string;
  sid: string;
  title: string;
  durationMs: number | null;
  onTimeUpdate?: (currentTimeSeconds: number, durationSeconds: number) => void;
  onEnded?: () => void;
}

export function MicroContentPlayer({
  microContentId,
  sid,
  title,
  onTimeUpdate,
  onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration || 0);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-black shadow-lg aspect-video">
      <video
        ref={videoRef}
        controls
        controlsList="nodownload"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={onEnded}
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
