import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

type VideoFileUrl = {
  url: string;
  mimeType: string;
  durationMs: number;
  title: string;
};

/**
 * Stream video từ MinIO về trình duyệt của học viên và giảng viên.
 * Chuyển tiếp nguyên vẹn header Range để trình phát video có thể tua (seek) tự do.
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
  let videoInfo: VideoFileUrl;
  try {
    videoInfo = await coreApi.getMicroContentVideoUrl<VideoFileUrl>(
      id,
      claimsFromSession(activeSession.session),
    );
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    const message = error instanceof Error ? error.message : "Không thể mở video.";
    return NextResponse.json({ error: message }, { status });
  }

  if (videoInfo.mimeType === "video/youtube") {
    return NextResponse.json(
      {
        error: "Video YouTube được phát qua khung nhúng iframe.",
        embedUrl: videoInfo.url,
      },
      { status: 400 },
    );
  }

  const range = request.headers.get("range");
  const upstream = await fetch(videoInfo.url, {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Storage trả về HTTP ${upstream.status}.` },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": videoInfo.mimeType || "video/mp4",
    "Content-Disposition": `inline; filename="${encodeURIComponent(videoInfo.title || "video")}.mp4"`,
    "Accept-Ranges": "bytes",
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
