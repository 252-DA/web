import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { isValidOrigin, readSessionFromRequest } from "@/lib/route-session";

export async function GET(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    const claims = claimsFromSession(activeSession.session);
    const list = await coreApi.listContentGenerationRequests(
      {
        courseId: activeSession.session.courseId,
        type: "micro_outline",
        limit: 10,
      },
      claims,
    );
    return NextResponse.json(Array.isArray(list) ? list : []);
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tải trạng thái tách slide." },
      { status },
    );
  }
}

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    }

    const body = (await request.json()) as { documentId?: unknown };
    const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
    if (!documentId) {
      return NextResponse.json({ error: "Thiếu documentId bộ slide." }, { status: 400 });
    }

    const claims = claimsFromSession(activeSession.session);
    const created = await coreApi.requestMicroContentOutline(
      { courseId: activeSession.session.courseId, documentId },
      claims,
    );
    return NextResponse.json(created);
  } catch (error) {
    const status = coreApiErrorStatus(error, 400);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể gửi yêu cầu tách nội dung slide." },
      { status },
    );
  }
}
