import { NextRequest, NextResponse } from "next/server";
import { coreApi } from "@/lib/core-api";
import { manageApiError, readManageApiSession } from "@/lib/route-session";

export async function GET(request: NextRequest) {
  const auth = await readManageApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    const courseId = request.nextUrl.searchParams.get("courseId") || auth.session.courseId;
    const banks = await coreApi.listQuestionBanks({ courseId }, auth.claims);
    return NextResponse.json(banks, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return manageApiError(error, "Không tải được danh sách ngân hàng câu hỏi.");
  }
}

export async function POST(request: NextRequest) {
  const auth = await readManageApiSession(request, true);
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const created = await coreApi.createQuestionBank(
      { ...body, courseId: body.courseId || auth.session.courseId },
      auth.claims,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return manageApiError(error, "Không tạo được ngân hàng câu hỏi.");
  }
}
