import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/documents", { error: "Phiên đã hết hạn." });
  }
  try {
    const { id } = await params;
    const form = await request.formData();
    await coreApi.updateDocumentPlacement(
      id,
      {
        role: String(form.get("role") || "") || undefined,
        // Rỗng = "Tự động": để hệ thống tự xác định chương.
        chapterCode: String(form.get("chapterCode") ?? ""),
      },
      claimsFromSession(activeSession.session),
    );
    return redirectBack(request, "/manage/documents", {
      success: "Đã lưu; đang gắn lại tài liệu với chuẩn đầu ra.",
    });
  } catch (error) {
    return redirectBack(request, "/manage/documents", {
      error: messageFromError(error, "Không thể lưu vai trò/chương của tài liệu."),
    });
  }
}
