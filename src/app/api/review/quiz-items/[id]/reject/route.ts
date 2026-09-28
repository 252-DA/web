import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/review", { error: "Phiên đã hết hạn." });
  }
  try {
    const form = await request.formData();
    const reason = String(form.get("reason") || "").trim();
    if (!reason) {
      return redirectBack(request, "/manage/review", { error: "Hãy nhập lý do cần chỉnh sửa." });
    }
    const { id } = await params;
    await coreApi.rejectQuizItem(id, reason, claimsFromSession(activeSession.session));
    return redirectBack(request, "/manage/review", { success: "Đã ghi nhận yêu cầu chỉnh sửa." });
  } catch (error) {
    return redirectBack(request, "/manage/review", {
      error: messageFromError(error, "Không thể cập nhật câu hỏi."),
    });
  }
}
