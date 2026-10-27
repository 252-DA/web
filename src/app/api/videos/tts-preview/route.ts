import { NextRequest, NextResponse } from "next/server";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const voice = body.voice || "vi-VN-HoaiMyNeural";
    const text = body.text || "";

    const defaultWorkerUrl = process.env.MICRO_CONTENT_WORKER_URL || "http://micro-content-video-worker:8086";

    let res: Response;
    try {
      res = await fetch(`${defaultWorkerUrl}/tts-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice, text }),
      });
    } catch {
      res = await fetch("http://localhost:8086/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice, text }),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Không thể tạo âm thanh nghe thử." },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi khi xử lý giọng đọc." },
      { status: 500 },
    );
  }
}

