import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/documents", { error: "Phiên đã hết hạn." });
  }
  try {
    const form = await request.formData();
    const courseId = String(form.get("courseId") || activeSession.session.courseId || "");
    if (!courseId) {
      return redirectBack(request, "/manage/documents", { error: "Thiếu courseId." });
    }
    await coreApi.syncDocumentsFromCanvas(
      courseId,
      claimsFromSession(activeSession.session),
    );
    return redirectBack(request, "/manage/documents", {
      success: "Đã yêu cầu đồng bộ từ Canvas. Tài liệu sẽ được xử lý trong nền; tải lại trang sau ít phút để xem kết quả.",
    });
  } catch (error) {
    return redirectBack(request, "/manage/documents", {
      error: messageFromError(error, "Không thể đồng bộ tài liệu từ Canvas."),
    });
  }
}
