import { NextRequest, NextResponse } from "next/server";
import { coreApi } from "@/lib/core-api";
import { manageApiError, readManageApiSession } from "@/lib/route-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; quizId: string }> },
) {
  const auth = await readManageApiSession(request, true);
  if (!auth.ok) return auth.response;
  try {
    const { id, quizId } = await params;
    const body = (await request.json().catch(() => ({}))) as { restore?: boolean };
    const result = await coreApi.retireQuestionBankItem(
      {
        bankId: id,
        quizId,
        ...(typeof body.restore === "boolean" ? { restore: body.restore } : {}),
      },
      auth.claims,
    );
    return NextResponse.json(result);
  } catch (error) {
    return manageApiError(error, "Không cập nhật được trạng thái câu hỏi.");
  }
}
