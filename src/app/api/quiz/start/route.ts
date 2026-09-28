import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";
import { LTI_CONFIG } from "@/lib/lti";

/** Bắt đầu (hoặc tiếp tục) một lượt làm bài kiểm tra mở từ Canvas. */
export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Phiên đã hết hạn. Mở lại bài từ Canvas." }, { status: 401 });
  }
  try {
    if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin)
      return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    const body = await request.json();
    const session = activeSession.session;
    if (
      session.targetKind !== "quiz_set" ||
      session.targetId !== body.quizSetId ||
      !session.resourceLinkId
    )
      return NextResponse.json({ error: "Mở đúng bài kiểm tra từ Canvas trước khi bắt đầu." }, { status: 403 });
    return NextResponse.json(
      await coreApi.startQuizSet(
        { quizSetId: session.targetId, resourceLinkId: session.resourceLinkId },
        claimsFromSession(session),
      ),
    );
  } catch (error) {
    const status = error instanceof CoreApiError ? ({ 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không bắt đầu được bài kiểm tra." },
      { status },
    );
  }
}
