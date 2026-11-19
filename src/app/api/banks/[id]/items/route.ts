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
    const sp = request.nextUrl.searchParams;
    const data = await coreApi.listQuestionBankItems(
      {
        bankId: id,
        lo: sp.get("lo") || undefined,
        type: sp.get("type") || undefined,
        status: sp.get("status") || undefined,
        origin: sp.get("origin") || undefined,
        search: sp.get("search") || undefined,
      },
      auth.claims,
    );
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return manageApiError(error, "Không tải được danh sách câu hỏi.");
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
    const created = await coreApi.createQuestionBankItem({ ...body, bankId: id }, auth.claims);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return manageApiError(error, "Không thêm được câu hỏi.");
  }
}
