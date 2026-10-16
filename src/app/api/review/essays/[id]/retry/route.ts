import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

/** Giao lại câu tự luận cho AI chấm, ví dụ sau khi nhà cung cấp model hết lỗi. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/review", { error: "Phiên đã hết hạn." });
  }
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return redirectBack(request, "/manage/review", { error: "Nguồn yêu cầu không hợp lệ." });
  }
  try {
    const { id } = await params;
    await coreApi.retryEssayGrading(id, claimsFromSession(activeSession.session));
    return redirectBack(request, "/manage/review", { success: "Đã giao lại cho AI chấm." });
  } catch (error) {
    return redirectBack(request, "/manage/review", {
      error: messageFromError(error, "Không giao lại được cho AI."),
    });
  }
}
