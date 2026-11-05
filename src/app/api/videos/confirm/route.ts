import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
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

    const result = await coreApi.confirmVideoAssetUpload(
      {
        assetId: body.assetId,
        sizeBytes: body.sizeBytes,
        durationMs: body.durationMs,
        objectKey: body.objectKey,
      },
      claims,
    );

    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? ({ 3: 400, 7: 403, 16: 401 }[error.status] ?? 502)
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xác nhận upload video." },
      { status },
    );
  }
}

