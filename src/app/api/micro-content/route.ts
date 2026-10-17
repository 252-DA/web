import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
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
      },
      claims,
    );

    return NextResponse.json(created);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 7: 403, 16: 401 }[error.status] ?? 502
        : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tạo Micro Content." },
      { status },
    );
  }
}

