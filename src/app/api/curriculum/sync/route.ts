import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

type SyncResult = {
  file_name: string;
  status: string;
  reused: boolean;
};

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/curriculum", { error: "Phiên đã hết hạn." });
  }
  try {
    const form = await request.formData();
    const courseId = String(form.get("courseId") || activeSession.session.courseId || "");
    if (!courseId) {
      return redirectBack(request, "/manage/curriculum", { error: "Thiếu courseId." });
    }
    const result = await coreApi.syncCurriculumFromCanvas<SyncResult>(
      courseId,
      claimsFromSession(activeSession.session),
    );
    const success = result.reused
      ? `File "${result.file_name}" chưa thay đổi so với lần đồng bộ trước; dùng lại kết quả đó.`
      : `Đã lấy "${result.file_name}" từ Canvas và đang trích xuất đề cương.`;
    return redirectBack(request, "/manage/curriculum", { success });
  } catch (error) {
    return redirectBack(request, "/manage/curriculum", {
      error: messageFromError(error, "Không thể đồng bộ đề cương từ Canvas."),
    });
  }
}
