import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

type SubtitlesUrlResponse = {
  url: string | null;
  mimeType: string;
  transcriptText: string | null;
  sceneTimeline: unknown[];
};

/**
 * Proxy phụ đề WebVTT từ MinIO (qua presigned URL của core-api) về trình duyệt.
 * Nếu video chưa có file .vtt thì trả WebVTT rỗng để thẻ <track> không báo lỗi mạng.
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
  let info: SubtitlesUrlResponse;
  try {
    info = await coreApi.getMicroContentSubtitles<SubtitlesUrlResponse>(
      id,
      claimsFromSession(activeSession.session),
    );
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    const message = error instanceof Error ? error.message : "Không thể tải phụ đề.";
    return NextResponse.json({ error: message }, { status });
  }

  if (!info.url) {
    return new NextResponse("WEBVTT\n\n", {
      status: 200,
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const upstream = await fetch(info.url, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Storage trả về HTTP ${upstream.status}.` },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
