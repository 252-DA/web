import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

type DocumentFileUrl = {
  url: string;
  mime_type: string;
  file_name: string;
};

/**
 * Bytes của tài liệu cho viewer. MinIO nằm trong mạng nội bộ nên trình duyệt
 * không gọi thẳng presigned URL được: route fetch ở phía server rồi stream lại,
 * đúng cách route upload đang làm ngược chiều.
 *
 * Range được chuyển tiếp nguyên vẹn để PDF.js tải từng phần thay vì kéo cả file.
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
  let file: DocumentFileUrl;
  try {
    file = await coreApi.getDocumentFileUrl<DocumentFileUrl>(
      id,
      claimsFromSession(activeSession.session),
    );
  } catch (error) {
    // CoreApiError.status là mã gRPC, không phải HTTP.
    const status =
      error instanceof CoreApiError
        ? ({ 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502)
        : 500;
    const message = error instanceof Error ? error.message : "Không mở được tài liệu.";
    return NextResponse.json({ error: message }, { status });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(file.url, {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Object storage trả về HTTP ${upstream.status}.` },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": file.mime_type,
    // inline: viewer nhúng trong trang, không phải tải về.
    "Content-Disposition": `inline; filename="${encodeURIComponent(file.file_name)}"`,
    "Accept-Ranges": "bytes",
    // Presigned URL hạn ngắn; đừng để proxy nào giữ lại bytes đã ký.
    "Cache-Control": "private, no-store",
  });
  for (const header of ["content-length", "content-range", "etag"]) {
    const value = upstream.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
