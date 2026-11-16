import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, claimsFromSession, coreApi, coreApiErrorStatus } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { readSessionFromRequest } from "@/lib/route-session";

/** Người hỏi chấm 👍 (1) / 👎 (-1) cho câu trả lời của mình; 0 để bỏ chấm. */
export async function POST(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  let payload: { runId?: unknown; rating?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Payload không hợp lệ." }, { status: 400 });
  }
  if (typeof payload.runId !== "string" || ![-1, 0, 1].includes(Number(payload.rating))) {
    return NextResponse.json({ error: "Thiếu runId hoặc rating không hợp lệ." }, { status: 400 });
  }
  try {
    const result = await coreApi.rateChatRun(
      { runId: payload.runId, rating: Number(payload.rating) },
      claimsFromSession(active.session),
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof CoreApiError ? String(error.body) : "Không lưu được đánh giá.";
    return NextResponse.json({ error: message }, { status: coreApiErrorStatus(error, 400) });
  }
}
