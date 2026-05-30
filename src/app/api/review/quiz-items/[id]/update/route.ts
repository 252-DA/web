import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (activeSession) {
    const form = await request.formData();
    const { id } = await params;
    const data = {
      question: String(form.get("question") || ""),
      options: JSON.parse(String(form.get("options") || "[]")),
      correct_answer: JSON.parse(String(form.get("correct_answer") || "null")),
      explanation: String(form.get("explanation") || ""),
    };
    await coreApi.updateQuizItem(id, data, claimsFromSession(activeSession.session));
  }
  return redirectBack(request, "/manage/review");
}
