import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";
import { LTI_CONFIG } from "@/lib/lti";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
      return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    }

    const { id } = await context.params;
    const session = activeSession.session;
    const claims = claimsFromSession(session);
    const body = await request.json();

    const result = await coreApi.reportMicroContentProgress(
      {
        microContentId: id,
        positionMs: Math.round(Number(body.positionMs) || 0),
      },
      claims,
    );

    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật tiến độ." },
      { status },
    );
  }
}
