import type { BffClaims } from "@/lib/bff-jwt";
import { coreApi } from "@/lib/core-api";
import type { ChatCitation } from "@/lib/chat";

type DocumentInfo = { title: string; mime_type: string | null; course_id: string };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { info: DocumentInfo | null; expires: number }>();

async function documentInfo(documentId: string, claims: BffClaims): Promise<DocumentInfo | null> {
  const hit = cache.get(documentId);
  if (hit && hit.expires > Date.now()) return hit.info;
  let info: DocumentInfo | null = null;
  try {
    info = await coreApi.getDocument<DocumentInfo>(documentId, claims);
  } catch {
    // Tài liệu đã xóa hoặc không đọc được: vẫn hiện trích dẫn, chỉ thiếu tên.
  }
  cache.set(documentId, { info, expires: Date.now() + TTL_MS });
  return info;
}

/**
 * Trích dẫn từ ai-tutor chỉ có document_id. Gắn tên và loại tài liệu để người học
 * biết nguồn là file nào và mở được đúng trang. Chỉ nhận tài liệu của khóa học
 * trong phiên: cache dùng chung giữa các phiên nên không tin document_id lạ.
 */
export async function withDocumentNames(
  citations: ChatCitation[],
  courseId: string,
  claims: BffClaims,
): Promise<ChatCitation[]> {
  if (citations.length === 0) return citations;
  const ids = [...new Set(citations.map((c) => c.document_id).filter(Boolean))];
  const infos = new Map(
    await Promise.all(ids.map(async (id) => [id, await documentInfo(id, claims)] as const)),
  );
  return citations.map((c) => {
    const info = infos.get(c.document_id);
    if (!info || info.course_id !== courseId) return c;
    return { ...c, document_name: info.title, mime_type: info.mime_type };
  });
}
