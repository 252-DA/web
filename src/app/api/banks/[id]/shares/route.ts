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
    const candidates = await coreApi.listQuestionBankShareCandidates(id, auth.claims);
    return NextResponse.json(candidates, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return manageApiError(error, "Không tải được danh sách gợi ý chia sẻ.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await readManageApiSession(request, true);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const share = await coreApi.shareQuestionBank({ ...body, bankId: id }, auth.claims);
    return NextResponse.json(share);
  } catch (error) {
    return manageApiError(error, "Không chia sẻ được ngân hàng câu hỏi.");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await readManageApiSession(request, true);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    let granteeType = sp.get("granteeType") || "";
    let granteeId = sp.get("granteeId") || "";
    if (!granteeType || !granteeId) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      if (!granteeType && typeof body.granteeType === "string") granteeType = body.granteeType;
      if (!granteeId && typeof body.granteeId === "string") granteeId = body.granteeId;
    }
    const result = await coreApi.unshareQuestionBank(
      { bankId: id, granteeType, granteeId },
      auth.claims,
    );
    return NextResponse.json(result);
  } catch (error) {
    return manageApiError(error, "Không thu hồi được quyền chia sẻ.");
  }
}
