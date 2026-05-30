import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const body = await request.json();
  const result = await coreApi.createUploadSession(body, claimsFromSession(activeSession.session));
  return NextResponse.json(result);
}
