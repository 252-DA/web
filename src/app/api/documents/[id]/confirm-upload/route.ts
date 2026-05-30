import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { id } = await params;
  const result = await coreApi.confirmUpload(id, claimsFromSession(activeSession.session));
  return NextResponse.json(result);
}
