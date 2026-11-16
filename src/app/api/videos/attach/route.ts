import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const claims = claimsFromSession(activeSession.session);

    const result = await coreApi.attachVideoAssetToMicroContent(
      {
        microContentId: body.microContentId,
        assetId: body.assetId ?? null,
      },
      claims,
    );

    return NextResponse.json(result);
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể gắn video vào bài giảng." },
      { status },
    );
  }
}

