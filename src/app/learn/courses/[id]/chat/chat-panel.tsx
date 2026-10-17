"use client";

import { useRef, useState } from "react";
import type { ChatCitation, ChatMode, TutorReply } from "@/lib/chat";

type Turn = {
  id: number;
  question: string;
  answer?: string;
  citations?: ChatCitation[];
  error?: string;
  runId?: string | null;
  rating?: number;
  mode?: ChatMode;
  trace?: TutorReply["trace"];
};

type Props = {
  sid?: string;
  /** Giảng viên/TA thấy chế độ truy xuất và vết công cụ của từng câu trả lời. */
  showTrace: boolean;
  /** Trong ngăn bên hẹp của Canvas: chiếm hết chiều cao, tin nhắn cuộn riêng, ô nhập ở đáy. */
  embedded?: boolean;
};

function withSid(path: string, sid?: string) {
  return sid ? `${path}?sid=${encodeURIComponent(sid)}` : path;
}

function citationLabel(c: ChatCitation) {
  const where = c.heading_path.length ? c.heading_path[c.heading_path.length - 1] : "Tài liệu";
  return c.page_number ? `${where} · tr. ${c.page_number}` : where;
}

// Trong một dòng: "[1]" thành chỉ số nhỏ (chỉ số không có trích dẫn đi kèm thì để nguyên chữ), **…** thành chữ đậm,
// `…` thành mã. Không đổi *…* vì dấu sao còn gặp trong công thức.
function Inline({ text, known }: { text: string; known: Set<number> }) {
  const parts = text.split(/(\[\d+\]|\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        const bold = /^\*\*([^*\n]+)\*\*$/.exec(part);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const code = /^`([^`\n]+)`$/.exec(part);
        if (code) {
          return (
            <code key={i} className="rounded bg-slate-100 px-1 font-mono text-[0.85em]">
              {code[1]}
            </code>
          );
        }
        const match = /^\[(\d+)\]$/.exec(part);
        if (match && known.has(Number(match[1]))) {
          return (
            <sup key={i} className="mx-0.5 rounded bg-sky-100 px-1 text-xs font-semibold text-sky-800">
              {match[1]}
            </sup>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[]; start: number };

// Chỉ phần markdown mô hình thực sự dùng: đoạn văn (cách nhau dòng trống), danh sách gạch đầu dòng và đánh số.
// Tiêu đề "## …" hạ thành một dòng chữ đậm.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  // Sau một dòng trống, dòng kế tiếp luôn mở khối mới.
  let open = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      open = false;
      continue;
    }
    const last = open ? blocks[blocks.length - 1] : undefined;
    open = true;
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = bullet ? null : /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]], start: 1 });
      continue;
    }
    if (numbered) {
      if (last?.kind === "ol") last.items.push(numbered[2]);
      else blocks.push({ kind: "ol", items: [numbered[2]], start: Number(numbered[1]) });
      continue;
    }
    if (last && last.kind !== "p" && /^\s+/.test(line)) {
      // Dòng thụt vào ngay sau một mục là phần tiếp của mục đó.
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const content = heading ? `**${heading[1].replace(/\*\*/g, "")}**` : line;
    if (last?.kind === "p" && !heading) last.lines.push(content);
    else blocks.push({ kind: "p", lines: [content] });
  }
  return blocks;
}

function AnswerText({ text, citations }: { text: string; citations: ChatCitation[] }) {
  const known = new Set(citations.map((c) => c.index));
  return (
    <div className="space-y-2.5 leading-relaxed">
      {toBlocks(text).map((block, i) => {
        if (block.kind === "p") {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  <Inline text={line} known={known} />
                </span>
              ))}
            </p>
          );
        }
        const items = block.items.map((item, j) => (
          <li key={j} className="pl-0.5">
            <Inline text={item} known={known} />
          </li>
        ));
        return block.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-slate-400">
            {items}
          </ul>
        ) : (
          <ol key={i} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-slate-500">
            {items}
          </ol>
        );
      })}
    </div>
  );
}

export function ChatPanel({ sid, showTrace, embedded = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);

  const patch = (id: number, change: Partial<Turn>) =>
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t)));

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    const id = nextId.current++;
    // Lịch sử gửi lên là các cặp hỏi/đáp đã xong, để chatbot hiểu câu hỏi nối tiếp.
    const history = turns
      .filter((t) => t.answer)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer as string },
      ]);
    setTurns((all) => [...all, { id, question }]);
    setInput("");
    setBusy(true);
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const response = await fetch(withSid("/api/chat", sid), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question, history }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<TutorReply> & {
        error?: string;
        runId?: string | null;
        mode?: ChatMode;
        trace?: TutorReply["trace"];
      };
      if (!response.ok || !data.answer) {
        patch(id, { error: data.error || "Chatbot không trả lời được.", runId: data.runId });
      } else {
        patch(id, {
          answer: data.answer,
          citations: data.citations ?? [],
          runId: data.runId,
          mode: data.mode,
          trace: data.trace,
        });
      }
    } catch {
      patch(id, { error: "Mất kết nối tới máy chủ." });
    } finally {
      setBusy(false);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function rate(turn: Turn, value: 1 | -1) {
    if (!turn.runId) return;
    const next = turn.rating === value ? 0 : value;
    patch(turn.id, { rating: next });
    try {
      await fetch(withSid("/api/chat/rate", sid), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: turn.runId, rating: next }),
      });
    } catch {
      patch(turn.id, { rating: turn.rating });
    }
  }

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col gap-3" : "flex flex-col gap-4"}>
      <div className={embedded ? "min-h-0 flex-1 space-y-4 overflow-y-auto" : "space-y-5"}>
        {turns.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Hỏi bất cứ điều gì về tài liệu của khóa học. Câu trả lời chỉ dựa trên tài liệu và có số trích dẫn để mở lại
            đúng đoạn. Nếu tài liệu không nói về điều đó, chatbot sẽ nói rõ thay vì đoán.
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <div className="ml-auto max-w-[85%] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white">
              <p className="whitespace-pre-wrap">{turn.question}</p>
            </div>
            <div className="max-w-[92%] rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              {turn.error ? (
                <p className="text-red-700">{turn.error}</p>
              ) : turn.answer ? (
                <>
                  <AnswerText text={turn.answer} citations={turn.citations ?? []} />
                  {(turn.citations?.length ?? 0) > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                      {turn.citations?.map((c) => (
                        <li key={c.chunk_id}>
                          <details className="group">
                            <summary className="cursor-pointer text-xs text-slate-700">
                              <span className="mr-1.5 rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">
                                {c.index}
                              </span>
                              {citationLabel(c)}
                            </summary>
                            {c.quote && (
                              <p className="mt-1.5 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">{c.quote}</p>
                            )}
                            {c.heading_path.length > 1 && (
                              <p className="mt-1 pl-3 text-xs text-slate-400">{c.heading_path.join(" › ")}</p>
                            )}
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    {turn.runId && (
                      <>
                        <button
                          type="button"
                          aria-label="Câu trả lời hữu ích"
                          aria-pressed={turn.rating === 1}
                          onClick={() => rate(turn, 1)}
                          className={`rounded border px-2 py-1 ${turn.rating === 1 ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 hover:border-slate-400"}`}
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          aria-label="Câu trả lời chưa tốt"
                          aria-pressed={turn.rating === -1}
                          onClick={() => rate(turn, -1)}
                          className={`rounded border px-2 py-1 ${turn.rating === -1 ? "border-red-600 bg-red-50 text-red-800" : "border-slate-200 hover:border-slate-400"}`}
                        >
                          👎
                        </button>
                      </>
                    )}
                    {showTrace && turn.trace && (
                      <span className="ml-auto text-slate-400">
                        {turn.mode} · {turn.trace.steps} bước · {turn.trace.tool_calls.length} lần gọi công cụ ·{" "}
                        {(turn.trace.latency_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {showTrace && turn.trace && turn.trace.tool_calls.length > 0 && (
                    <details className="mt-2 text-xs text-slate-600">
                      <summary className="cursor-pointer">Vết công cụ</summary>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                        {turn.trace.tool_calls.map((call, i) => (
                          <li key={i}>
                            <code>{call.tool}</code> {call.args ? JSON.stringify(call.args) : ""}{" "}
                            {call.ok === false ? <span className="text-red-700">lỗi {call.error}</span> : null}
                            {typeof call.found === "number" ? <span className="text-slate-400">→ {call.found}</span> : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              ) : (
                <p className="animate-pulse text-slate-500">Đang tìm trong tài liệu…</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className={`flex gap-2 border-t border-slate-200 ${embedded ? "shrink-0 pt-3" : "sticky bottom-0 bg-slate-50 py-3"}`}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Nhập câu hỏi về tài liệu khóa học…"
          className="flex-1 resize-none rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          disabled={busy || !input.trim()}
          className="self-end rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Đang trả lời…" : "Gửi"}
        </button>
      </form>
    </div>
  );
}
