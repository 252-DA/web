"use client";

import type { ChatCitation } from "@/lib/chat";
import { IconBack, IconClose, IconExternal, IconFile } from "./chat-icons";

function withSid(path: string, sid?: string) {
  return sid ? `${path}?sid=${encodeURIComponent(sid)}` : path;
}

/** Đề cương môn học không thuộc file nào nên không có tài liệu để mở. */
function isOutline(c: ChatCitation) {
  return c.kind === "outline" || !c.document_id;
}

const OUTLINE_LABEL = "Đề cương môn học";

/** "Ch2_LSH_lecture.pdf" → "Ch2 LSH lecture": tên file dễ đọc trong nhãn nguồn. */
export function documentLabel(c: ChatCitation): string {
  if (isOutline(c)) return c.heading_path[0]?.trim() || OUTLINE_LABEL;
  const name = c.document_name?.trim();
  if (!name) return "Tài liệu";
  return name.replace(/\.(pdf|pptx?|docx?)$/i, "").replace(/[_]+/g, " ").trim() || name;
}

function isPdf(c: ChatCitation) {
  return c.mime_type === "application/pdf" || /\.pdf$/i.test(c.document_name ?? "");
}

function fileUrl(c: ChatCitation, sid?: string, page = true) {
  const base = withSid(`/api/documents/${encodeURIComponent(c.document_id)}/file`, sid);
  return page && c.page_number ? `${base}#page=${c.page_number}` : base;
}

/** Các nguồn của một câu trả lời: bấm để xem đoạn trích và trang tài liệu ở khung bên. */
export function SourceChips({
  citations,
  activeChunkId,
  onOpen,
  muted = false,
}: {
  citations: ChatCitation[];
  activeChunkId?: string | null;
  onOpen?: (c: ChatCitation) => void;
  muted?: boolean;
}) {
  if (citations.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {citations.map((c) => {
        const active = c.chunk_id === activeChunkId;
        return (
          <li key={c.chunk_id} className="min-w-0 max-w-full">
            <button
              type="button"
              disabled={!onOpen}
              onClick={() => onOpen?.(c)}
              title={isOutline(c) ? c.heading_path.join(" › ") || documentLabel(c) : [documentLabel(c), ...c.heading_path].join(" › ")}
              className={`flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                active
                  ? "border-sky-400 bg-sky-50 text-sky-900"
                  : muted
                    ? "border-slate-200 bg-white text-slate-400"
                    : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
              }`}
            >
              <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-800">{c.index}</span>
              <span className="truncate">{documentLabel(c)}</span>
              {!isOutline(c) && c.page_number ? <span className="shrink-0 text-slate-500">tr. {c.page_number}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Khung xem nguồn: đoạn được trích, đường dẫn mục và trang PDF tương ứng. */
export function SourcePanel({
  citation,
  sid,
  compact,
  onClose,
}: {
  citation: ChatCitation;
  sid?: string;
  /** Trong ngăn hẹp của Canvas khung nguồn phủ lên chat nên nút đóng là "quay lại". */
  compact: boolean;
  onClose: () => void;
}) {
  const outline = isOutline(citation);
  const pdf = !outline && isPdf(citation);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-start gap-2 border-b border-slate-200 px-4 py-3">
        {compact && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Quay lại cuộc trò chuyện"
            className="-ml-1 mt-0.5 rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <IconBack />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span className="rounded-full bg-sky-100 px-1.5 text-sky-800">{citation.index}</span>
            Nguồn trích dẫn
          </p>
          <p
            className="mt-1 truncate text-sm font-semibold text-slate-900"
            title={outline ? undefined : (citation.document_name ?? undefined)}
          >
            {outline ? citation.heading_path.join(" › ") || documentLabel(citation) : documentLabel(citation)}
            {!outline && citation.page_number ? (
              <span className="font-normal text-slate-500"> · trang {citation.page_number}</span>
            ) : null}
          </p>
          {!outline && citation.heading_path.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{citation.heading_path.join(" › ")}</p>
          )}
        </div>
        {!compact && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng khung nguồn"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <IconClose />
          </button>
        )}
      </div>
      {!outline && citation.quote && (
        <blockquote className="shrink-0 border-b border-slate-100 bg-amber-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
          “{citation.quote}”
        </blockquote>
      )}
      <div className={outline ? "min-h-0 flex-1 overflow-y-auto bg-white" : "min-h-0 flex-1 bg-slate-100"}>
        {outline ? (
          <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-700">
            {citation.quote?.trim() || "Chưa có nội dung đề cương để hiển thị."}
          </p>
        ) : pdf ? (
          <iframe
            // key đổi theo trang để PDF viewer nhảy đúng trang khi chọn nguồn khác cùng tài liệu.
            key={`${citation.document_id}#${citation.page_number ?? ""}`}
            src={fileUrl(citation, sid)}
            title={`${documentLabel(citation)}, trang ${citation.page_number ?? 1}`}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600">
            <IconFile className="h-8 w-8 text-slate-400" />
            <p>Loại tài liệu này chưa xem trước được ngay trong khung chat.</p>
            <a
              href={fileUrl(citation, sid, false)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
            >
              Tải tài liệu
            </a>
          </div>
        )}
      </div>
      {pdf && sid && (
        <div className="shrink-0 border-t border-slate-200 px-4 py-2 text-right">
          <a
            href={fileUrl(citation, sid)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Mở ở tab mới <IconExternal className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
