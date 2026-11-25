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
    const defaultWorkerUrl =
      process.env.MICRO_CONTENT_WORKER_URL || "http://micro-content-video-worker:8086";

    const payload = JSON.stringify({
      visual_mode: body.visual_mode || "MANIM_TEMPLATE",
      title: body.title || "",
      bullets: Array.isArray(body.bullets) ? body.bullets : [],
      narration: body.narration || "",
      manim_template: body.manim_template || undefined,
      manim_params: body.manim_params || undefined,
      manim_source_code: body.manim_source_code || undefined,
      target_duration_seconds: body.target_duration_seconds || undefined,
      no_cache: Boolean(body.no_cache),
    });

    let res: Response;
    try {
      res = await fetch(`${defaultWorkerUrl}/manim-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      res = await fetch("http://localhost:8086/manim-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(120_000),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        {
          error: data.error || "Không thể render cảnh Manim xem trước.",
          error_category: data.error_category,
          tier_used: data.tier_used,
          attempts: data.attempts,
          source_code: data.source_code,
        },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Lỗi kết nối tới dịch vụ render Manim xem trước.",
      },
      { status: 500 },
    );
  }
}
