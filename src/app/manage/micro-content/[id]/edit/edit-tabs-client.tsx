"use client";

import { useState } from "react";
import { VideoPanel } from "./video-panel";
import { QuestionPanel } from "./question-panel";
import { PublishPanel } from "./publish-panel";

interface Props {
  microContent: any;
  sid: string;
  defaultTab?: string;
}

export function EditTabsClient({ microContent, sid, defaultTab = "questions" }: Props) {
  const [tab, setTab] = useState<"video" | "questions" | "publish">(
    (defaultTab as "video" | "questions" | "publish") || "questions",
  );

  return (
    <div className="space-y-6">
      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("video")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
            tab === "video"
              ? "border-sky-600 text-sky-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>📹 Video</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              microContent.videoStatus === "READY"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {microContent.videoStatus}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("questions")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
            tab === "questions"
              ? "border-sky-600 text-sky-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>📝 Câu hỏi củng cố</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {microContent.questions?.length ?? 0}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("publish")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
            tab === "publish"
              ? "border-sky-600 text-sky-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>🚀 Xuất bản & Điều kiện</span>
        </button>
      </div>

      {/* Tab Panels */}
      {tab === "video" && <VideoPanel microContent={microContent} sid={sid} />}
      {tab === "questions" && (
        <QuestionPanel
          microContentId={microContent.id}
          initialQuestions={microContent.questions || []}
          sid={sid}
        />
      )}
      {tab === "publish" && <PublishPanel microContent={microContent} sid={sid} />}
    </div>
  );
}
