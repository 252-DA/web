import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

/**
 * Chunk của tài liệu đang mở. `?page=N` trả đúng các chunk của trang đó — đây là
 * ngữ cảnh cho câu hỏi "giải thích trang này", tra cứu chính xác chứ không phải
 * similarity search.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  }

  const { id } = await params;
  const rawPage = request.nextUrl.searchParams.get("page");
  const page = rawPage === null || rawPage === "" ? undefined : Number(rawPage);
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
    return NextResponse.json({ error: "page phải là số nguyên >= 1." }, { status: 400 });
  }

  try {
    const chunks = await coreApi.getDocumentChunks(
      { documentId: id, page },
      claimsFromSession(activeSession.session),
    );
    return NextResponse.json(chunks);
  } catch (error) {
    // CoreApiError.status là mã gRPC, không phải HTTP.
    const status =
      error instanceof CoreApiError
        ? ({ 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502)
        : 500;
    const message = error instanceof Error ? error.message : "Không đọc được nội dung tài liệu.";
    return NextResponse.json({ error: message }, { status });
  }
}
