import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const claims = claimsFromSession(activeSession.session);
    // Nút "Fork AI" trong kho video nhân bản sang khoá học đang mở.
    const result = await coreApi.forkVideoAsset(
      { assetId: id, targetCourseId: activeSession.session.courseId },
      claims,
    );
    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? ({ 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502)
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể nhân bản (fork) video này." },
      { status },
    );
  }
}

