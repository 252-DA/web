import { NextRequest, NextResponse } from "next/server";
import { coreApi } from "@/lib/core-api";
import { manageApiError, readManageApiSession } from "@/lib/route-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await readManageApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const result = await coreApi.listQuestionBankSyncJobs(id, auth.claims);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return manageApiError(error, "Không tải được lịch sử xuất Canvas.");
  }
}
