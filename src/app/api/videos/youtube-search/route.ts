import { NextRequest, NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/route-session";
import { searchYoutubeVideos } from "@/lib/youtube-search";

export async function GET(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json(
      { error: "Vui lòng nhập từ khóa hoặc liên kết YouTube." },
      { status: 400 },
    );
  }

  const rawLang = searchParams.get("lang");
  const lang: "all" | "vi" | "en" =
    rawLang === "vi" || rawLang === "en" ? rawLang : "all";
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 8;

  try {
    const result = await searchYoutubeVideos({
      query: q,
      lang,
      limit: Number.isFinite(limit) ? limit : 8,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Không thể tìm kiếm video trên YouTube.",
      },
      { status: 502 },
    );
  }
}
