import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";
import { editFromForm } from "@/lib/question-types";

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
    const { id } = await params;
    // Form gửi kèm kiểu câu (ô ẩn `type`); core-api kiểm tra lại theo kiểu thật.
    const data = editFromForm(String(form.get("type") || "MCQ_SINGLE"), form);
    if (!data.question) throw new Error("Câu hỏi không được để trống.");

    await coreApi.updateQuizItem(id, data, claimsFromSession(activeSession.session));
    return redirectBack(request, "/manage/review", { success: "Đã lưu câu hỏi. Hãy approve sau khi kiểm tra lại." });
  } catch (error) {
    return redirectBack(request, "/manage/review", {
      error: messageFromError(error, "Dữ liệu quiz không hợp lệ."),
    });
  }
}
