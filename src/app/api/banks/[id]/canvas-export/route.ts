import { NextRequest, NextResponse } from "next/server";
import { coreApi } from "@/lib/core-api";
import { manageApiError, readManageApiSession } from "@/lib/route-session";

/** Xuất câu đã duyệt sang ngân hàng Classic của khoá Canvas đang mở (chạy nền). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await readManageApiSession(request, true);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const result = await coreApi.exportQuestionBankToCanvas(
      { bankId: id, courseId: auth.session.courseId },
      auth.claims,
    );
    return NextResponse.json(result);
  } catch (error) {
    return manageApiError(error, "Không xuất được ngân hàng sang Canvas.");
  }
}
