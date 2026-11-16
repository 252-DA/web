import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

type VideoStreamInfo = {
  url: string;
  mimeType: string;
  durationMs: number;
  title: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const microContentId = searchParams.get("microContentId") || undefined;
  const asJson = searchParams.get("json") === "true";

  let streamInfo: VideoStreamInfo;
  try {
    streamInfo = await coreApi.getVideoAssetUrl<VideoStreamInfo>(
      { assetId: id, microContentId },
      claimsFromSession(activeSession.session),
    );
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    const message = error instanceof Error ? error.message : "Không thể truy cập video.";
    return NextResponse.json({ error: message }, { status });
  }

  if (asJson) {
    return NextResponse.json(streamInfo);
  }

  // Stream proxy with Range support (MinIO is internal minio:9000)
  const range = request.headers.get("range");
  const upstream = await fetch(streamInfo.url, {
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
    "Content-Type": streamInfo.mimeType || "video/mp4",
    "Content-Disposition": `inline; filename="${encodeURIComponent(streamInfo.title || "video")}.mp4"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });

  const contentRange = upstream.headers.get("content-range");
  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

