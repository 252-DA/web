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
    const body = (await request.json()) as { targetBankId?: string };
    const result = await coreApi.forkQuestionBankItem(
      { bankId: id, quizId, targetBankId: String(body.targetBankId ?? "") },
      auth.claims,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return manageApiError(error, "Không nhân bản (fork) được câu hỏi.");
  }
}
