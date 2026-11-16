import { NextRequest } from "next/server";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

/**
 * Giảng viên/TA yêu cầu dựng đồ thị quan hệ cho một chương (hoặc một tài liệu).
 * Việc chạy ở content-generation-worker: trích quan hệ bằng LLM rồi chỉ giữ cái
 * có trích dẫn nguyên văn trong tài liệu.
 */
export async function POST(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return redirectBack(request, "/manage/chat", { error: "Phiên đã hết hạn." });
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return redirectBack(request, "/manage/chat", { error: "Nguồn yêu cầu không hợp lệ." });
  }
  try {
    const form = await request.formData();
    const chapterId = String(form.get("chapterId") ?? "").trim();
    const documentId = String(form.get("documentId") ?? "").trim();
    if (!chapterId && !documentId) {
      return redirectBack(request, "/manage/chat", { error: "Hãy chọn một chương hoặc một tài liệu." });
    }
    await coreApi.createContentGenerationRequest(
      {
        courseId: active.session.courseId,
        type: "relations",
        scope: chapterId ? { chapter_id: chapterId } : { source_document_ids: [documentId] },
      },
      claimsFromSession(active.session),
    );
    return redirectBack(request, "/manage/chat", {
      success: "Đã gửi yêu cầu dựng đồ thị quan hệ. Số quan hệ sẽ tăng khi worker xử lý xong (tải lại trang để xem).",
    });
  } catch (error) {
    return redirectBack(request, "/manage/chat", {
      error: messageFromError(error, "Không gửi được yêu cầu dựng đồ thị."),
    });
  }
}
