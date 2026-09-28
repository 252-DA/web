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
    const { id } = await params;
    const question = String(form.get("question") || "").trim();
    const explanation = String(form.get("explanation") || "").trim();
    const choiceFields = [0, 1, 2, 3].map((index) => String(form.get(`option_${index}`) || "").trim());
    const hasChoiceFields = choiceFields.some(Boolean);
    let options: unknown;
    let correctAnswer: unknown;

    if (hasChoiceFields) {
      if (!choiceFields.every(Boolean)) throw new Error("Quiz phải có đủ 4 lựa chọn.");
      if (new Set(choiceFields.map((choice) => choice.toLocaleLowerCase("vi"))).size !== 4) {
        throw new Error("Bốn lựa chọn phải khác nhau.");
      }
      const correctIndex = Number(form.get("correct_index"));
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        throw new Error("Hãy chọn một đáp án đúng.");
      }
      options = choiceFields;
      correctAnswer = choiceFields[correctIndex];
    } else {
      options = JSON.parse(String(form.get("options") || "[]"));
      correctAnswer = JSON.parse(String(form.get("correct_answer") || "null"));
    }
    if (!question) throw new Error("Câu hỏi không được để trống.");

    const data = {
      question,
      options,
      correct_answer: correctAnswer,
      explanation,
    };
    await coreApi.updateQuizItem(id, data, claimsFromSession(activeSession.session));
    return redirectBack(request, "/manage/review", { success: "Đã lưu câu hỏi. Hãy approve sau khi kiểm tra lại." });
  } catch (error) {
    return redirectBack(request, "/manage/review", {
      error: messageFromError(error, "Dữ liệu quiz không hợp lệ."),
    });
  }
}
