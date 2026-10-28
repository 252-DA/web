import type { ChatCitation } from "@/lib/chat";

type CiteHandler = (index: number) => void;

// Trong một dòng: "[1]" thành nút số trích dẫn (bấm mở nguồn; số không có trích dẫn đi kèm thì để nguyên chữ),
// **…** thành chữ đậm, `…` thành mã. Không đổi *…* vì dấu sao còn gặp trong công thức.
function Inline({ text, known, onCite }: { text: string; known: Set<number>; onCite?: CiteHandler }) {
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
          const n = Number(match[1]);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCite?.(n)}
              aria-label={`Mở nguồn ${n}`}
              className="mx-0.5 inline-flex -translate-y-1 items-center rounded bg-sky-100 px-1 align-baseline text-[11px] font-semibold leading-4 text-sky-800 hover:bg-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {n}
            </button>
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

export function AnswerText({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: ChatCitation[];
  onCite?: CiteHandler;
}) {
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
                  <Inline text={line} known={known} onCite={onCite} />
                </span>
              ))}
            </p>
          );
        }
        const items = block.items.map((item, j) => (
          <li key={j} className="pl-0.5">
            <Inline text={item} known={known} onCite={onCite} />
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

/** Chữ để sao chép: bỏ số trích dẫn và dấu ** của markdown. */
export function plainAnswer(text: string): string {
  return text
    .replace(/\s?\[\d+\]/g, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .trim();
}
