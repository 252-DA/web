"use client";

import { useState } from "react";
import { MicroContentPlayer, type SceneTimelineItem } from "./player";
import { MicroContentQuestions, type AttemptResult, type LearnQuestion } from "./questions";

export interface LearnMicroContentData {
  id: string;
  title: string;
  description: string | null;
  videoDurationMs: number | null;
  requiredWatchPercent: number;
  passingScore: number;
  hasSubtitles?: boolean;
  sceneTimeline?: SceneTimelineItem[];
  transcriptText?: string | null;
  loCode?: string | null;
  sourceDocumentTitle?: string | null;
  sourcePageFrom?: number | null;
  sourcePageTo?: number | null;
  questions: LearnQuestion[];
}

interface Props {
  microContent: LearnMicroContentData;
  initialResult?: AttemptResult | null;
  sid: string;
  isStaff: boolean;
}

export function LearnMicroContentClient({ microContent, initialResult, sid, isStaff }: Props) {
  const [watchedPercent, setWatchedPercent] = useState<number>(0);
  const [unlocked, setUnlocked] = useState<boolean>(
    microContent.requiredWatchPercent === 0 || isStaff || Boolean(initialResult),
  );

  const handleProgressUpdate = (data: { watchedPercent: number; unlocked: boolean }) => {
    setWatchedPercent(data.watchedPercent);
    if (data.unlocked || isStaff) {
      setUnlocked(true);
    }
  };

  return (
    <div className="space-y-8">
      {/* Video Player */}
      <MicroContentPlayer
        microContentId={microContent.id}
        sid={sid}
        title={microContent.title}
        durationMs={microContent.videoDurationMs}
        hasSubtitles={microContent.hasSubtitles}
        sceneTimeline={microContent.sceneTimeline}
        transcriptText={microContent.transcriptText}
        onProgressUpdate={handleProgressUpdate}
      />

      {/* Câu hỏi củng cố */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Câu hỏi củng cố kiến thức</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Trả lời các câu hỏi để kiểm tra mức độ nắm bắt bài học.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-600">
              Tiến độ xem: {watchedPercent}%
            </span>
            {microContent.requiredWatchPercent > 0 && (
              <span className="text-xs text-slate-400"> / {microContent.requiredWatchPercent}%</span>
            )}
          </div>
        </div>

        <MicroContentQuestions
          microContentId={microContent.id}
          questions={microContent.questions || []}
          requiredWatchPercent={microContent.requiredWatchPercent}
          passingScore={microContent.passingScore}
          initialResult={initialResult}
          sid={sid}
          isStaff={isStaff}
          unlocked={unlocked}
          watchedPercent={watchedPercent}
        />
      </section>
    </div>
  );
}
