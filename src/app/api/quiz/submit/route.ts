import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";
import { LTI_CONFIG } from "@/lib/lti";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    const body = await request.json();
    const session = activeSession.session;
    if (body.resourceLinkId && body.resourceLinkId !== session.resourceLinkId) return NextResponse.json({ error: "Bài tập đã đổi. Mở lại quiz từ Canvas." }, { status: 403 });
    if (body.quizSetId) {
      if (session.targetKind !== "quiz_set" || session.targetId !== body.quizSetId || !session.resourceLinkId) return NextResponse.json({ error: "Mở đúng quiz từ module Canvas trước khi nộp bài." }, { status: 403 });
      return NextResponse.json(await coreApi.submitQuizSet({ quizSetId: session.targetId, resourceLinkId: session.resourceLinkId, answers: body.answers, ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}) }, claimsFromSession(session)));
    }
    if (session.targetKind === "quiz_set" || (session.targetKind === "lesson" && session.targetId !== body.lessonId)) return NextResponse.json({ error: "Quiz không khớp bài tập Canvas." }, { status: 403 });
    const result = await coreApi.submitQuiz({ ...body, resourceLinkId: session.resourceLinkId }, claimsFromSession(session));
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof CoreApiError ? ({ 3: 400, 7: 403, 16: 401 }[error.status] ?? 502) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể chấm quiz." },
      { status },
    );
  }
}
