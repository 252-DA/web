"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatCitation, ChatContext, ChatMode, TutorReply } from "@/lib/chat";
import { ConversationList, type ConversationSummary } from "./chat-history";
import {
  IconCheck,
  IconCopy,
  IconDebug,
  IconMenu,
  IconPlus,
  IconRetry,
  IconSend,
  IconStop,
  IconThumbDown,
  IconThumbUp,
} from "./chat-icons";
import { AnswerText, plainAnswer } from "./chat-markdown";
import { SourceChips, SourcePanel } from "./chat-source-panel";

type Turn = {
  id: number;
  question: string;
  answer?: string;
  citations?: ChatCitation[];
  candidateCitations?: ChatCitation[];
  error?: string;
  stopped?: boolean;
  runId?: string | null;
  rating?: number;
  mode?: ChatMode;
  trace?: TutorReply["trace"];
  phase?: "searching" | "answering";
  activeTool?: string;
};

type Props = {
  sid?: string;
  /** Giảng viên/TA/admin được bật "chi tiết kỹ thuật": chế độ truy xuất và vết công cụ của từng câu. */
  canDebug: boolean;
  courseName?: string;
  /** Trong ngăn bên hẹp của Canvas: một cột, lịch sử và nguồn phủ lên khung chat. */
  embedded?: boolean;
};

function withSid(path: string, sid?: string, extra?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (sid) params.set("sid", sid);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

type ConversationPayload = {
  conversation: ConversationSummary | null;
  turns: Omit<Turn, "id">[];
  conversations: ConversationSummary[];
};

async function fetchConversation(sid?: string, conversationId?: string): Promise<ConversationPayload | null> {
  try {
    const res = await fetch(withSid("/api/chat", sid, { conversationId }), { cache: "no-store" });
    return res.ok ? ((await res.json()) as ConversationPayload) : null;
  } catch {
    // Không tải được lịch sử thì bắt đầu trống.
    return null;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // iframe của LMS có thể chặn Clipboard API: chép bằng vùng chọn tạm.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white"
    >
      AI
    </span>
  );
}

export function ChatPanel({ sid, canDebug, courseName, embedded = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<ChatCitation | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [debug, setDebug] = useState(false);
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const nearBottom = useRef(true);

  const patch = (id: number, change: Partial<Turn>) =>
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t)));

  const scrollToBottom = useCallback((force = false) => {
    const el = scroller.current;
    if (!el || (!force && !nearBottom.current)) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, []);

  // Tải hội thoại tách làm hai: fetch thuần, rồi áp vào state trong callback của promise.
  // Lần tải đầu đã bắt đầu ở trạng thái "đang tải"; chọn hội thoại khác thì đặt trạng thái đó trước.
  const applyConversation = useCallback(
    (data: ConversationPayload | null) => {
      if (data) {
        setConversations(data.conversations ?? []);
        setConversationId(data.conversation?.conversation_id ?? null);
        setTurns((data.turns ?? []).map((t) => ({ ...t, id: nextId.current++ })));
        nearBottom.current = true;
        scrollToBottom(true);
      }
      setLoadingHistory(false);
    },
    [scrollToBottom],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchConversation(sid).then((data) => {
      if (!cancelled) applyConversation(data);
    });
    fetch(withSid("/api/chat/context", sid), { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ChatContext>) : null))
      .then((data) => {
        if (!cancelled && data) setContext(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyConversation, sid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSource(null);
      setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ô nhập tự giãn theo nội dung, tối đa vài dòng.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);


  function startNewConversation() {
    if (busy) return;
    setConversationId(null);
    setTurns([]);
    setSource(null);
    setHistoryOpen(false);
    textarea.current?.focus();
  }

  function selectConversation(id: string) {
    setHistoryOpen(false);
    if (id === conversationId) return;
    setLoadingHistory(true);
    setSource(null);
    void fetchConversation(sid, id).then(applyConversation);
  }

  async function deleteConversation(targetId: string) {
    if (busy) return;
    if (targetId === conversationId) {
      setConversationId(null);
      setTurns([]);
      setSource(null);
    }
    setConversations((prev) => prev.filter((c) => c.conversation_id !== targetId));
    try {
      await fetch(withSid("/api/chat", sid, { conversationId: targetId }), { method: "DELETE" });
    } catch {
      // Đã xóa trên giao diện.
    }
  }

  function rememberConversation(id: string, question: string) {
    setConversationId(id);
    setConversations((prev) => {
      const now = new Date().toISOString();
      const existing = prev.find((c) => c.conversation_id === id);
      if (existing) {
        return [{ ...existing, updated_at: now }, ...prev.filter((c) => c.conversation_id !== id)];
      }
      const clean = question.replace(/\s+/g, " ").trim();
      const title = clean.length > 80 ? `${clean.slice(0, 80)}…` : clean || "Cuộc trò chuyện";
      return [{ conversation_id: id, title, created_at: now, updated_at: now }, ...prev];
    });
  }

  function stop() {
    abort.current?.abort();
  }

  async function send(override?: string) {
    const question = (override ?? input).trim();
    if (!question || busy) return;
    const id = nextId.current++;
    setTurns((all) => [...all, { id, question, phase: "searching" }]);
    if (override === undefined) setInput("");
    setBusy(true);
    nearBottom.current = true;
    scrollToBottom(true);
    const controller = new AbortController();
    abort.current = controller;

    try {
      const response = await fetch(withSid("/api/chat", sid), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ message: question, conversationId: conversationId ?? undefined, stream: true }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/event-stream") || !response.body) {
        const data = (await response.json().catch(() => ({}))) as Partial<TutorReply> & {
          error?: string;
          runId?: string | null;
          conversationId?: string | null;
          mode?: ChatMode;
        };
        if (data.conversationId) rememberConversation(data.conversationId, question);
        if (!response.ok || !data.answer) {
          patch(id, { error: data.error || "Trợ giảng AI chưa trả lời được.", runId: data.runId, phase: undefined });
        } else {
          patch(id, {
            answer: data.answer,
            citations: data.citations ?? [],
            runId: data.runId,
            mode: data.mode,
            trace: data.trace,
            phase: undefined,
          });
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const lines = frame.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const eventName = eventLine ? eventLine.slice(6).trim() : "message";
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (eventName === "step") {
            patch(id, {
              phase: payload.phase === "answering" ? "answering" : "searching",
              activeTool: typeof payload.tool === "string" ? payload.tool : undefined,
            });
          } else if (eventName === "evidence") {
            if (Array.isArray(payload.citations)) {
              patch(id, { candidateCitations: payload.citations as ChatCitation[] });
            }
          } else if (eventName === "delta") {
            const chunkText = typeof payload.text === "string" ? payload.text : "";
            if (chunkText) {
              setTurns((all) => all.map((t) => (t.id === id ? { ...t, answer: (t.answer ?? "") + chunkText } : t)));
              scrollToBottom();
            }
          } else if (eventName === "reset") {
            // Mô hình viết lại sau khi lượt trước bị loại: bỏ chữ đã phát để không nối chữ cũ với chữ mới.
            patch(id, { answer: undefined });
          } else if (eventName === "done") {
            const convId = typeof payload.conversationId === "string" ? payload.conversationId : null;
            if (convId) rememberConversation(convId, question);
            patch(id, {
              answer: typeof payload.answer === "string" ? payload.answer : "",
              citations: Array.isArray(payload.citations) ? (payload.citations as ChatCitation[]) : [],
              runId: typeof payload.runId === "string" ? payload.runId : null,
              mode: payload.mode as ChatMode | undefined,
              trace: payload.trace as TutorReply["trace"] | undefined,
              phase: undefined,
              activeTool: undefined,
            });
          } else if (eventName === "error") {
            const convId = typeof payload.conversationId === "string" ? payload.conversationId : null;
            if (convId) rememberConversation(convId, question);
            patch(id, {
              error: typeof payload.error === "string" ? payload.error : "Trợ giảng AI chưa trả lời được.",
              runId: typeof payload.runId === "string" ? payload.runId : null,
              phase: undefined,
              activeTool: undefined,
            });
          }
        }
      }
    } catch {
      if (controller.signal.aborted) {
        patch(id, { stopped: true, phase: undefined, activeTool: undefined });
      } else {
        patch(id, { error: "Mất kết nối tới máy chủ.", phase: undefined, activeTool: undefined });
      }
    } finally {
      abort.current = null;
      setBusy(false);
      scrollToBottom();
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

  async function copy(turn: Turn) {
    if (!turn.answer) return;
    if (await copyText(plainAnswer(turn.answer))) {
      setCopiedTurn(turn.id);
      setTimeout(() => setCopiedTurn((current) => (current === turn.id ? null : current)), 1500);
    }
  }

  function openCitation(turn: Turn, index: number) {
    const found = (turn.citations ?? turn.candidateCitations ?? []).find((c) => c.index === index);
    if (found) setSource(found);
  }

  const title = conversations.find((c) => c.conversation_id === conversationId)?.title ?? "Cuộc trò chuyện mới";
  const courseLabel = context?.course?.name ?? courseName;
  const history = (
    <ConversationList
      conversations={conversations}
      activeId={conversationId}
      disabled={busy || loadingHistory}
      onSelect={selectConversation}
      onNew={startNewConversation}
      onDelete={(id) => void deleteConversation(id)}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 bg-white text-slate-900">
      {!embedded && (
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:block">{history}</aside>
      )}

      {/* Lịch sử dạng ngăn trượt: luôn dùng trong ngăn Canvas, và trên màn hình hẹp. */}
      {historyOpen && (
        <div className={`absolute inset-0 z-30 flex ${embedded ? "" : "md:hidden"}`}>
          <div className="h-full w-72 max-w-[85%] border-r border-slate-200 bg-slate-50 shadow-xl">{history}</div>
          <button
            type="button"
            aria-label="Đóng lịch sử"
            onClick={() => setHistoryOpen(false)}
            className="flex-1 bg-slate-900/20"
          />
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Lịch sử trò chuyện"
            className={`rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 ${embedded ? "" : "md:hidden"}`}
          >
            <IconMenu />
          </button>
          {/* Tên công cụ và khóa học đã ở tiêu đề ngăn Canvas / đầu trang: ở đây chỉ còn tên hội thoại. */}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>
            {title}
          </p>
          {canDebug && (
            <button
              type="button"
              onClick={() => setDebug((on) => !on)}
              aria-pressed={debug}
              title="Chi tiết kỹ thuật (chỉ giảng viên thấy)"
              className={`rounded-lg p-1.5 ${debug ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <IconDebug />
            </button>
          )}
          <button
            type="button"
            onClick={startNewConversation}
            disabled={busy || (!conversationId && turns.length === 0)}
            title="Cuộc trò chuyện mới"
            aria-label="Cuộc trò chuyện mới"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <IconPlus />
          </button>
        </header>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className={`mx-auto max-w-3xl space-y-6 ${embedded ? "px-3 py-4" : "px-4 py-6"}`}>
            {loadingHistory && turns.length === 0 && (
              <p className="animate-pulse text-sm text-slate-400">Đang tải cuộc trò chuyện…</p>
            )}

            {!loadingHistory && turns.length === 0 && (
              <div className={embedded ? "pt-2" : "pt-8"}>
                <div className="flex items-center gap-3">
                  <Avatar />
                  <h2 className="text-lg font-semibold">
                    Hỏi trợ giảng AI{courseLabel ? ` về ${courseLabel}` : ""}
                  </h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Câu trả lời chỉ dựa trên tài liệu giảng viên đã đưa lên. Mỗi ý đều có số trích dẫn, bấm vào để xem
                  đúng đoạn và đúng trang. Nếu tài liệu không nói tới, trợ giảng sẽ nói rõ thay vì đoán.
                </p>
                {context && context.suggestions.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Bạn có thể hỏi</p>
                    <div className={`grid gap-2 ${embedded ? "" : "sm:grid-cols-2"}`}>
                      {context.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={busy}
                          onClick={() => void send(s)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {context && context.documents.length > 0 && (
                  <details className="mt-4 text-xs text-slate-500">
                    <summary className="cursor-pointer">
                      Trợ giảng đang dùng {context.documents.length} tài liệu của khóa học
                    </summary>
                    <ul className="mt-2 space-y-0.5 pl-4">
                      {context.documents.map((d) => (
                        <li key={d.document_id} className="truncate">
                          {d.title}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {turns.map((turn) => {
              const sources = turn.citations ?? [];
              const pending = !turn.answer && !turn.error && !turn.stopped;
              return (
                <div key={turn.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-sm text-white">
                      <p className="whitespace-pre-wrap">{turn.question}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {!embedded && <Avatar />}
                    <div className="min-w-0 flex-1 text-sm">
                      {turn.error ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{turn.error}</p>
                      ) : turn.answer ? (
                        <AnswerText
                          text={turn.answer}
                          citations={turn.citations ?? turn.candidateCitations ?? []}
                          onCite={(n) => openCitation(turn, n)}
                        />
                      ) : null}

                      {pending && (
                        <div className="space-y-2">
                          <p className="animate-pulse text-slate-500">
                            {turn.phase === "answering"
                              ? "Đang soạn câu trả lời…"
                              : debug && turn.activeTool
                                ? `Đang tìm trong tài liệu (${turn.activeTool})…`
                                : "Đang tìm trong tài liệu…"}
                          </p>
                          {(turn.candidateCitations?.length ?? 0) > 0 && (
                            <div>
                              <p className="mb-1 text-xs text-slate-400">
                                Đã tìm thấy {turn.candidateCitations?.length} đoạn liên quan
                              </p>
                              <SourceChips citations={turn.candidateCitations ?? []} muted />
                            </div>
                          )}
                        </div>
                      )}

                      {turn.stopped && (
                        <p className="mt-2 text-xs text-slate-500">
                          Đã dừng. Nếu trợ giảng vẫn trả lời xong, câu trả lời sẽ có khi mở lại cuộc trò chuyện này.
                        </p>
                      )}

                      {sources.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-medium text-slate-500">Nguồn</p>
                          <SourceChips citations={sources} activeChunkId={source?.chunk_id} onOpen={setSource} />
                        </div>
                      )}

                      {(turn.answer || turn.error || turn.stopped) && !pending && (
                        <div className="mt-2 flex flex-wrap items-center gap-1 text-slate-500">
                          {turn.answer && (
                            <button
                              type="button"
                              onClick={() => void copy(turn)}
                              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-slate-100"
                            >
                              {copiedTurn === turn.id ? <IconCheck /> : <IconCopy />}
                              {copiedTurn === turn.id ? "Đã chép" : "Sao chép"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void send(turn.question)}
                            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-slate-100 disabled:opacity-40"
                          >
                            <IconRetry />
                            Hỏi lại
                          </button>
                          {turn.runId && turn.answer && (
                            <>
                              <button
                                type="button"
                                aria-label="Câu trả lời hữu ích"
                                aria-pressed={turn.rating === 1}
                                onClick={() => void rate(turn, 1)}
                                className={`rounded-md p-1 ${turn.rating === 1 ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}`}
                              >
                                <IconThumbUp />
                              </button>
                              <button
                                type="button"
                                aria-label="Câu trả lời chưa tốt"
                                aria-pressed={turn.rating === -1}
                                onClick={() => void rate(turn, -1)}
                                className={`rounded-md p-1 ${turn.rating === -1 ? "bg-red-50 text-red-700" : "hover:bg-slate-100"}`}
                              >
                                <IconThumbDown />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {debug && turn.trace && (
                        <details className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
                          <summary className="cursor-pointer">
                            {turn.mode} · {turn.trace.steps} bước · {turn.trace.tool_calls.length} lần gọi công cụ ·{" "}
                            {(turn.trace.latency_ms / 1000).toFixed(1)}s
                          </summary>
                          {turn.trace.tool_calls.length > 0 && (
                            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                              {turn.trace.tool_calls.map((call, i) => (
                                <li key={i}>
                                  <code>{call.tool}</code> {call.args ? JSON.stringify(call.args) : ""}{" "}
                                  {call.ok === false ? <span className="text-red-700">lỗi {call.error}</span> : null}
                                  {typeof call.found === "number" ? (
                                    <span className="text-amber-700/70">→ {call.found}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          )}
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className={`shrink-0 border-t border-slate-200 bg-white ${embedded ? "px-3 py-2.5" : "px-4 py-3"}`}
        >
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-slate-500">
              <textarea
                ref={textarea}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={4000}
                aria-label="Câu hỏi"
                placeholder="Hỏi về nội dung khóa học…"
                className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Dừng trả lời"
                  title="Dừng"
                  className="rounded-full bg-slate-900 p-2 text-white hover:bg-slate-700"
                >
                  <IconStop />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Gửi câu hỏi"
                  title="Gửi (Enter)"
                  className="rounded-full bg-slate-900 p-2 text-white hover:bg-slate-700 disabled:bg-slate-300"
                >
                  <IconSend />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[11px] leading-snug text-slate-400">
              Trợ giảng AI chỉ dựa trên tài liệu khóa học và có thể sai — hãy mở nguồn để kiểm tra. Hỏi về điểm, hạn
              nộp: liên hệ giảng viên.
            </p>
          </div>
        </form>
      </section>

      {source && (
        <aside
          className={
            embedded
              ? "absolute inset-0 z-20"
              : "fixed inset-0 z-40 lg:static lg:z-auto lg:w-[440px] lg:shrink-0 lg:border-l lg:border-slate-200"
          }
        >
          <SourcePanel citation={source} sid={sid} compact={embedded} onClose={() => setSource(null)} />
        </aside>
      )}
    </div>
  );
}
