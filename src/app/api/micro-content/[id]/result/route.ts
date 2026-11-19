import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

type AttemptRow = {
  attempt_id: string;
  user_id: string;
  grading_status: string;
};

/**
 * Lấy chi tiết kết quả một lượt làm bài micro-content (hoặc lượt mới nhất của học viên
 * nếu không truyền `attemptId`), dùng cho tải lại trang và polling chấm câu tự luận ngắn.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const claims = claimsFromSession(activeSession.session);
    let attemptId = request.nextUrl.searchParams.get("attemptId")?.trim() || "";

    if (!attemptId) {
      const listed = await coreApi.listMicroContentAttempts<{ attempts?: AttemptRow[] }>(
        id,
        claims,
      );
      const rows = Array.isArray(listed?.attempts) ? listed.attempts : [];
      const mine = rows.find((row) => row.user_id === claims.sub) ?? rows[0];
      if (!mine?.attempt_id) {
        return NextResponse.json({ result: null });
      }
      attemptId = mine.attempt_id;
    }

    const result = await coreApi.getMicroContentResult(attemptId, claims);
    return NextResponse.json({ result });
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể tải kết quả làm bài." },
      { status },
    );
  }
}
