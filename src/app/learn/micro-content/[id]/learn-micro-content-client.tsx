"use client";

import { useState } from "react";
import { MicroContentPlayer } from "./player";
import { MicroContentQuestions } from "./questions";

interface Props {
  microContent: {
    id: string;
    title: string;
    description: string | null;
    videoDurationMs: number | null;
    requiredWatchPercent: number;
    passingScore: number;
    questions: any[];
  };
  sid: string;
  isStaff: boolean;
}

export function LearnMicroContentClient({ microContent, sid, isStaff }: Props) {
  const [watchedPercent, setWatchedPercent] = useState<number>(0);
  const [unlocked, setUnlocked] = useState<boolean>(
    microContent.requiredWatchPercent === 0 || isStaff,
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
          sid={sid}
          isStaff={isStaff}
          unlocked={unlocked}
          watchedPercent={watchedPercent}
        />
      </section>
    </div>
  );
}
