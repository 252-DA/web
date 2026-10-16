import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

/** Giảng viên chấm tay một câu tự luận AI không chấm được. */
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
    const form = await request.formData();
    await coreApi.gradeEssayAnswer(
      { attemptId: id, score: String(form.get("score") ?? ""), feedback: String(form.get("feedback") ?? "") },
      claimsFromSession(activeSession.session),
    );
    return redirectBack(request, "/manage/review", { success: "Đã lưu điểm tự luận." });
  } catch (error) {
    return redirectBack(request, "/manage/review", {
      error: messageFromError(error, "Không lưu được điểm."),
    });
  }
}
