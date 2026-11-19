import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    }

    const session = activeSession.session;
    const claims = claimsFromSession(session);
    const body = await request.json();

    const created = await coreApi.createMicroContent(
      {
        courseId: session.courseId,
        title: body.title,
        description: body.description,
        videoSource: body.videoSource || "UPLOAD",
        passingScore: body.passingScore !== undefined ? Number(body.passingScore) : 70,
        requiredWatchPercent:
          body.requiredWatchPercent !== undefined ? Number(body.requiredWatchPercent) : 90,
        ...(body.sourceDocumentId !== undefined
          ? { sourceDocumentId: body.sourceDocumentId }
          : {}),
        ...(body.sourcePageFrom !== undefined
          ? {
              sourcePageFrom:
                body.sourcePageFrom === null ? null : Number(body.sourcePageFrom),
            }
          : {}),
        ...(body.sourcePageTo !== undefined
          ? {
              sourcePageTo:
                body.sourcePageTo === null ? null : Number(body.sourcePageTo),
            }
          : {}),
        ...(body.loId !== undefined ? { loId: body.loId } : {}),
        ...(body.position !== undefined
          ? { position: body.position === null ? null : Number(body.position) }
          : {}),
      },
      claims,
    );

    return NextResponse.json(created);
  } catch (error) {
    const status = coreApiErrorStatus(error, 400);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tạo Micro Content." },
      { status },
    );
  }
}

