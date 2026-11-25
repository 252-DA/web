"use client";

import { type MouseEvent, useCallback, useEffect, useId, useRef, useState } from "react";

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
  videoSource?: string;
  durationMs: number | null;
  youtubeVideoId?: string | null;
  youtubeEmbedUrl?: string | null;
  youtubeWatchUrl?: string | null;
  youtubeChannelTitle?: string | null;
  youtubeStartSec?: number | null;
  youtubeEndSec?: number | null;
  hasSubtitles?: boolean;
  sceneTimeline?: SceneTimelineItem[];
  transcriptText?: string | null;
  onProgressUpdate?: (data: { watchedPercent: number; unlocked: boolean }) => void;
}

interface YtPlayerInstance {
  getCurrentTime?: () => number;
  destroy?: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: () => void;
          };
        },
      ) => YtPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function formatTimestamp(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

let ytApiPromise: Promise<void> | null = null;

function ensureYoutubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No window"));
  }
  if (window.YT?.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const existing = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      reject(new Error("YouTube API timeout"));
    }, 5000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (existing) existing();
      resolve();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Failed to load YouTube IFrame API"));
      };
      document.head.appendChild(script);
    }
  }).catch((err) => {
    ytApiPromise = null;
    throw err;
  });

  return ytApiPromise;
}

export function MicroContentPlayer({
  microContentId,
  sid,
  title,
  videoSource,
  durationMs,
  youtubeVideoId = null,
  youtubeEmbedUrl = null,
  youtubeWatchUrl = null,
  youtubeChannelTitle = null,
  youtubeStartSec = null,
  youtubeEndSec = null,
  hasSubtitles = false,
  sceneTimeline = [],
  transcriptText = null,
  onProgressUpdate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YtPlayerInstance | null>(null);
  const ytTargetId = useId().replace(/:/g, "-");
  const lastHeartbeatRef = useRef<number>(0);
  const lastFramePosMsRef = useRef<number | null>(null);
  const playedAccMsRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  const [currentMs, setCurrentMs] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [ytApiFallback, setYtApiFallback] = useState(false);

  const isYoutube = videoSource === "YOUTUBE" && Boolean(youtubeVideoId);

  useEffect(() => {
    onProgressUpdateRef.current = onProgressUpdate;
  }, [onProgressUpdate]);

  const sendProgress = useCallback(
    async (positionMs: number, playedMs = 0) => {
      try {
        const res = await fetch(
          `/api/micro-content/${microContentId}/progress?sid=${encodeURIComponent(sid)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionMs, playedMs }),
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
          return;
        }
      } catch {
        // Bỏ qua lỗi heartbeat để không làm gián đoạn việc xem
      }
      if (playedMs > 0) {
        playedAccMsRef.current += playedMs;
      }
    },
    [microContentId, sid],
  );

  const accumulateFrameDelta = (positionMs: number) => {
    if (!isSeekingRef.current && lastFramePosMsRef.current !== null) {
      const delta = positionMs - lastFramePosMsRef.current;
      // Một nhịp timeupdate bình thường ~250ms (tối đa ~500ms ở tốc độ 2x);
      // loại bỏ bước nhảy lớn do kéo thanh tua.
      if (delta > 0 && delta <= 2500) {
        playedAccMsRef.current += delta;
      }
    }
    lastFramePosMsRef.current = positionMs;
  };

  const flushPlayedProgress = useCallback(
    (positionMs: number, now: number) => {
      const playedMs = playedAccMsRef.current;
      playedAccMsRef.current = 0;
      lastHeartbeatRef.current = now;
      void sendProgress(positionMs, playedMs);
    },
    [sendProgress],
  );

  // YouTube IFrame API progress tracker
  useEffect(() => {
    if (!isYoutube || !youtubeVideoId || !ytContainerRef.current) return;

    let destroyed = false;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let playing = false;
    let lastTickAt = Date.now();

    const stopTick = () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const readYtPositionMs = () => {
      try {
        const sec = ytPlayerRef.current?.getCurrentTime?.() ?? 0;
        const offsetSec = youtubeStartSec ? Math.max(0, sec - youtubeStartSec) : sec;
        return Math.max(0, Math.round(offsetSec * 1000));
      } catch {
        return 0;
      }
    };

    ensureYoutubeIframeApi()
      .then(() => {
        if (destroyed || !ytContainerRef.current || !window.YT?.Player) return;
        const playerVars: Record<string, string | number> = {
          rel: 0,
          modestbranding: 1,
        };
        if (youtubeStartSec && youtubeStartSec > 0) {
          playerVars.start = youtubeStartSec;
        }
        if (youtubeEndSec && youtubeEndSec > 0) {
          playerVars.end = youtubeEndSec;
        }

        ytPlayerRef.current = new window.YT.Player(ytTargetId, {
          videoId: youtubeVideoId,
          playerVars,
          events: {
            onStateChange: (event) => {
              if (destroyed) return;
              const state = event.data;
              if (state === 1) {
                playing = true;
                lastTickAt = Date.now();
                stopTick();
                tickTimer = setInterval(() => {
                  if (!playing || destroyed) return;
                  const now = Date.now();
                  const delta = Math.min(2500, Math.max(0, now - lastTickAt));
                  lastTickAt = now;
                  playedAccMsRef.current += delta;
                  const posMs = readYtPositionMs();
                  setCurrentMs(posMs);
                  if (now - lastHeartbeatRef.current >= 10000) {
                    flushPlayedProgress(posMs, now);
                  }
                }, 1000);
              } else if (state === 2 || state === 0) {
                if (playing) {
                  const now = Date.now();
                  playedAccMsRef.current += Math.min(2500, Math.max(0, now - lastTickAt));
                }
                playing = false;
                stopTick();
                const posMs =
                  state === 0 && durationMs && durationMs > 0
                    ? durationMs
                    : readYtPositionMs();
                setCurrentMs(posMs);
                flushPlayedProgress(posMs, Date.now());
              }
            },
            onError: () => {
              if (!destroyed) setYtApiFallback(true);
            },
          },
        });
      })
      .catch(() => {
        if (!destroyed) setYtApiFallback(true);
      });

    return () => {
      destroyed = true;
      stopTick();
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {
        // Bỏ qua lỗi dọn player
      }
      ytPlayerRef.current = null;
    };
  }, [
    isYoutube,
    youtubeVideoId,
    youtubeStartSec,
    youtubeEndSec,
    durationMs,
    ytTargetId,
    flushPlayedProgress,
  ]);

  const handleSeeking = () => {
    isSeekingRef.current = true;
    lastFramePosMsRef.current = null;
  };

  const handleSeeked = () => {
    isSeekingRef.current = false;
    const video = videoRef.current;
    if (video) {
      lastFramePosMsRef.current = Math.round(video.currentTime * 1000);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) return;

    const positionMs = Math.round(video.currentTime * 1000);
    setCurrentMs(positionMs);
    accumulateFrameDelta(positionMs);

    const now = Date.now();
    // Gửi heartbeat mỗi ~10 giây chỉ khi video thực sự đang phát
    if (now - lastHeartbeatRef.current >= 10000) {
      flushPlayedProgress(positionMs, now);
    }
  };

  const handlePauseOrEnd = () => {
    const video = videoRef.current;
    if (!video) return;
    const positionMs = Math.round(video.currentTime * 1000);
    setCurrentMs(positionMs);
    accumulateFrameDelta(positionMs);
    flushPlayedProgress(positionMs, Date.now());
  };

  const handleSeekButtonClick = (e: MouseEvent<HTMLButtonElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const startMs = Number(e.currentTarget.dataset.startMs ?? 0);
    const prevPosMs = Math.round(video.currentTime * 1000);
    if (playedAccMsRef.current > 0) {
      flushPlayedProgress(prevPosMs, Date.now());
    }
    isSeekingRef.current = true;
    lastFramePosMsRef.current = null;
    video.currentTime = Math.max(0, startMs / 1000);
    setCurrentMs(startMs);
    void video.play().catch(() => undefined);
  };

  // Khởi tạo heartbeat ban đầu để lấy trạng thái tiến độ hiện tại
  useEffect(() => {
    void sendProgress(0, 0);
  }, [sendProgress]);

  const sortedTimeline = [...sceneTimeline].sort((a, b) => a.start_ms - b.start_ms);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-black shadow-lg aspect-video">
        {isYoutube ? (
          ytApiFallback && youtubeEmbedUrl ? (
            <iframe
              src={youtubeEmbedUrl}
              title={title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div ref={ytContainerRef} className="w-full h-full">
              <div id={ytTargetId} className="w-full h-full" />
            </div>
          )
        ) : (
          <video
            ref={videoRef}
            controls
            controlsList="nodownload"
            playsInline
            onSeeking={handleSeeking}
            onSeeked={handleSeeked}
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
        )}
      </div>

      {isYoutube && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              YouTube
            </span>
            {youtubeChannelTitle && (
              <span>
                Kênh: <strong className="text-slate-800">{youtubeChannelTitle}</strong>
              </span>
            )}
            {(youtubeStartSec !== null || youtubeEndSec !== null) && (
              <span className="text-slate-500">
                · Đoạn phát: {youtubeStartSec ?? 0}s –{" "}
                {youtubeEndSec !== null ? `${youtubeEndSec}s` : "hết"}
              </span>
            )}
          </div>
          {youtubeWatchUrl && (
            <a
              href={youtubeWatchUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-600 hover:underline"
            >
              Mở trên YouTube ↗
            </a>
          )}
        </div>
      )}

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
                    data-start-ms={scene.start_ms}
                    onClick={handleSeekButtonClick}
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
