import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest, redirectBack } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (activeSession) {
    const form = await request.formData();
    const { id } = await params;
    await coreApi.rejectCard(id, String(form.get("reason") || ""), claimsFromSession(activeSession.session));
  }
  return redirectBack(request, "/manage/review");
}
