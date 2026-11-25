import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

export async function GET(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const microContentId = searchParams.get("microContentId")?.trim();
  if (!microContentId) {
    return NextResponse.json({ error: "Thiếu microContentId." }, { status: 400 });
  }
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 6;

  try {
    const claims = claimsFromSession(activeSession.session);
    const result = await coreApi.recommendVideoAssets(
      {
        microContentId,
        limit: Number.isFinite(limit) ? limit : 6,
      },
      claims,
    );
    return NextResponse.json(result);
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách video đề xuất.",
      },
      { status },
    );
  }
}
