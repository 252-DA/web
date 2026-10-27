import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

export async function GET(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") || "all";
  const search = searchParams.get("search") || undefined;
  const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

  try {
    const claims = claimsFromSession(activeSession.session);
    const result = await coreApi.listVideoAssets(
      {
        courseId: activeSession.session.courseId,
        scope,
        search,
        page,
        limit,
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
      { error: error instanceof Error ? error.message : "Không thể tải danh sách video." },
      { status },
    );
  }
}

