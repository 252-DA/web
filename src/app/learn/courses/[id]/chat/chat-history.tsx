"use client";

import { useState } from "react";
import { IconPlus, IconTrash } from "./chat-icons";

export type ConversationSummary = {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Props = {
  conversations: ConversationSummary[];
  activeId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

const DAY = 24 * 60 * 60 * 1000;

function groupOf(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || t >= startOfToday) return "Hôm nay";
  if (t >= startOfToday - DAY) return "Hôm qua";
  if (t >= startOfToday - 7 * DAY) return "7 ngày qua";
  return "Cũ hơn";
}

/** Danh sách hội thoại theo nhóm thời gian; xóa phải xác nhận ngay tại dòng đó. */
export function ConversationList({ conversations, activeId, disabled, onSelect, onNew, onDelete }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const now = new Date();
  const groups: { label: string; items: ConversationSummary[] }[] = [];
  for (const c of conversations) {
    const label = groupOf(c.updated_at, now);
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(c);
    else groups.push({ label, items: [c] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-3">
        <button
          type="button"
          onClick={onNew}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          <IconPlus />
          Cuộc trò chuyện mới
        </button>
      </div>
      <nav aria-label="Lịch sử trò chuyện" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-xs text-slate-500">Chưa có cuộc trò chuyện nào.</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((c) => {
                const active = c.conversation_id === activeId;
                if (confirmId === c.conversation_id) {
                  return (
                    <li key={c.conversation_id} className="rounded-lg bg-red-50 px-2 py-2 text-xs text-red-900">
                      <p className="mb-1.5">Xóa cuộc trò chuyện này?</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmId(null);
                            onDelete(c.conversation_id);
                          }}
                          className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
                        >
                          Xóa
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded border border-red-200 bg-white px-2 py-1 hover:bg-red-100"
                        >
                          Hủy
                        </button>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={c.conversation_id} className="group relative">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(c.conversation_id)}
                      aria-current={active ? "true" : undefined}
                      title={c.title}
                      className={`w-full truncate rounded-lg py-2 pl-2.5 pr-8 text-left text-sm disabled:opacity-60 ${
                        active ? "bg-slate-200 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setConfirmId(c.conversation_id)}
                      aria-label={`Xóa cuộc trò chuyện "${c.title}"`}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-red-700 focus:opacity-100 group-hover:opacity-100 disabled:hidden"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
