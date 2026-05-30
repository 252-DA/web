import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (activeSession) {
    const { id } = await params;
    await coreApi.approveCard(id, claimsFromSession(activeSession.session));
  }
  return redirectBack(request, "/manage/review");
}
