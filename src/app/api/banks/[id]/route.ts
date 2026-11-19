import { NextRequest, NextResponse } from "next/server";
import { coreApi } from "@/lib/core-api";
import { manageApiError, readManageApiSession } from "@/lib/route-session";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await readManageApiSession(request, true);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const updated = await coreApi.updateQuestionBank({ ...body, bankId: id }, auth.claims);
    return NextResponse.json(updated);
  } catch (error) {
    return manageApiError(error, "Không cập nhật được ngân hàng câu hỏi.");
  }
}
