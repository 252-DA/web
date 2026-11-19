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
    const { id } = await params;
    await coreApi.publishLesson(id, claimsFromSession(activeSession.session));
    return redirectBack(request, "/manage/review", { success: "Đã publish các nội dung được approve." });
  } catch (error) {
    return redirectBack(request, "/manage/review", {
      error: messageFromError(error, "Không thể publish lesson."),
    });
  }
}
