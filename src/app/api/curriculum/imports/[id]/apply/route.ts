import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/curriculum", { error: "Phiên đã hết hạn." });
  }
  try {
    const { id } = await params;
    await coreApi.applyCurriculumImport(id, claimsFromSession(activeSession.session));
    return redirectBack(request, "/manage/curriculum", {
      success: "Đang áp dụng đề cương vào khoá học.",
    });
  } catch (error) {
    return redirectBack(request, "/manage/curriculum", {
      error: messageFromError(error, "Không thể áp dụng đề cương."),
    });
  }
}
