import { NextRequest, NextResponse } from "next/server";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import type { ChatContext } from "@/lib/chat";
import { readSessionFromRequest } from "@/lib/route-session";

type Course = { code: string; name: string };
type CatalogDocument = { document_id: string; title: string; headings: string[] };

const MAX_SUGGESTIONS = 4;
// Mục chung của slide/bài báo, không phải một khái niệm để hỏi.
const GENERIC =
  /^(agenda|outline|contents?|ref|references?|abstract|introduction|conclusions?|acknowledge?ments|related work|thank(s| you)|slides?|summary|overview|solution|results?|discussion|appendix|demo|q\s*&\s*a|questions?|giới thiệu|tóm tắt|mục lục|kết luận|tài liệu tham khảo)\b/i;
const NOISE = /[=|§•©]|https?:|\bhcmut\b|\bhpc lab\b/i;
const TEMPLATES = [
  (t: string) => `${t} là gì? Cho một ví dụ.`,
  (t: string) => `Giải thích ${t} bằng ví dụ đơn giản.`,
  (t: string) => `Tài liệu nói gì về ${t}?`,
];

/** Rút tên khái niệm từ một tiêu đề mục: "2.1 Object Store APIs" → "Object Store APIs", "Min-Hashing: Overview" → "Min-Hashing". */
function concept(heading: string): string | null {
  let t = heading.replace(/\s+/g, " ").trim();
  if (NOISE.test(t) || /[?:]$/.test(t)) return null;
  t = t.replace(/^(\d+(\.\d+)*\.?|step \d+:)\s*/i, "");
  t = t.split(/\s*[:–]\s*|\s+-\s+/)[0];
  t = t.replace(/\s*\([^)]*\)\s*$/, "").replace(/[*.,;]+$/, "").trim();
  if (t.length < 3 || t.length > 40 || t.split(" ").length > 5) return null;
  // Mảnh câu bị cắt thường bắt đầu bằng chữ thường; tiêu đề toàn chữ hoa là mục của bài báo.
  if (!/^\p{Lu}/u.test(t) || (t === t.toUpperCase() && /\p{L}{4}/u.test(t))) return null;
  if (GENERIC.test(t)) return null;
  return t;
}

/** Số giả ngẫu nhiên ổn định theo khóa và ngày: gợi ý đổi mỗi ngày, không nhảy mỗi lần tải. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Mỗi tài liệu góp tối đa một câu, lấy từ tiêu đề mục thật nên trợ giảng trả lời được. */
function suggestionsFrom(documents: CatalogDocument[], seed: string): string[] {
  const random = seeded(seed);
  const pools = documents
    .map((d) => {
      const docName = d.title.replace(/\.[a-z]+$/i, "").toLowerCase();
      // Tiêu đề đầu thường là tên bài hoặc tên người dạy.
      const concepts = d.headings.slice(1).map(concept).filter((c): c is string => !!c && c.toLowerCase() !== docName);
      return [...new Set(concepts)];
    })
    .filter((pool) => pool.length > 0);
  for (let i = pools.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pools[i], pools[j]] = [pools[j], pools[i]];
  }
  const picked: string[] = [];
  for (const pool of pools) {
    if (picked.length >= MAX_SUGGESTIONS) break;
    const term = pool[Math.floor(random() * pool.length)];
    picked.push(TEMPLATES[picked.length % TEMPLATES.length](term));
  }
  return picked;
}

export async function GET(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  const { session } = active;
  if (!session.courseId) {
    return NextResponse.json({ error: "Phiên không gắn với khóa học nào." }, { status: 400 });
  }
  const claims = claimsFromSession(session);
  const [course, catalog] = await Promise.all([
    coreApi.getCourse<Course>(session.courseId, claims).catch(() => null),
    coreApi
      .getChatCatalog<{ documents: CatalogDocument[] }>(session.courseId, claims)
      .catch(() => ({ documents: [] as CatalogDocument[] })),
  ]);
  const documents = catalog?.documents ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const body: ChatContext = {
    course: course ? { code: course.code, name: course.name } : null,
    documents: documents.map((d) => ({ document_id: d.document_id, title: d.title })),
    suggestions: suggestionsFrom(documents, `${session.courseId}:${today}`),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
