import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, claimsFromSession, coreApi } from "@/lib/core-api";
import { isActiveRequest } from "@/lib/quiz";
import { readSessionFromRequest } from "@/lib/route-session";

type LearningOutcome = { lo_id: string; code: string; bloom_level: number };
type GenerationRequestSummary = {
  type: string;
  status: string;
  updated_at?: string | null;
  created_at?: string | null;
};

const DEFAULT_RECENT_LIMIT = 20;
const ACTIVE_REQUEST_SCAN_LIMIT = 100;
const BLOOM_BY_LEVEL: Record<number, string> = {
  1: "remember",
  2: "understand",
  3: "apply",
  4: "analyze",
  5: "evaluate",
  6: "create",
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGenerationRequestSummary(value: unknown): value is GenerationRequestSummary {
  return (
    isJsonObject(value) &&
    typeof value.type === "string" &&
    typeof value.status === "string"
  );
}

function isTimestamp(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}

/** Mốc thời gian là thứ quyết định một yêu cầu còn chặn hay đã treo, nên phải kiểm. */
function asProgress(request: GenerationRequestSummary): GenerationRequestSummary {
  return {
    status: request.status,
    type: request.type,
    updated_at: isTimestamp(request.updated_at) ? request.updated_at : null,
    created_at: isTimestamp(request.created_at) ? request.created_at : null,
  };
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CoreApiError) {
    const status = error.status === 3 ? 400 : error.status === 7 ? 403 : error.status === 16 ? 401 : 502;
    return NextResponse.json({ error: String(error.body || fallback) }, { status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_RECENT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, Math.trunc(rawLimit)))
    : DEFAULT_RECENT_LIMIT;
  try {
    const result = await coreApi.listContentGenerationRequests<unknown>(
      { courseId: active.session.courseId, limit, type: "quiz" },
      claimsFromSession(active.session),
    );
    if (!Array.isArray(result)) {
      return NextResponse.json({ error: "Core API trả về dữ liệu không hợp lệ." }, { status: 502 });
    }
    const quizRequests = result.filter(
      (item): item is GenerationRequestSummary =>
        isGenerationRequestSummary(item) && item.type === "quiz",
    );
    return NextResponse.json(quizRequests, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Không thể đọc trạng thái sinh quiz.");
  }
}

export async function POST(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload không hợp lệ." }, { status: 400 });
  }
  if (!isJsonObject(payload)) {
    return NextResponse.json({ error: "Payload phải là một JSON object." }, { status: 400 });
  }

  const targetId = typeof payload.targetId === "string" ? payload.targetId.trim() : "";
  const count = payload.count;
  if (!targetId) return NextResponse.json({ error: "Hãy chọn learning outcome." }, { status: 400 });
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 10) {
    return NextResponse.json({ error: "Số câu hỏi phải từ 1 đến 10." }, { status: 400 });
  }

  const claims = claimsFromSession(active.session);
  try {
    const [learningOutcomes, recentRequests] = await Promise.all([
      coreApi.listLearningOutcomes<LearningOutcome[]>(active.session.courseId, claims),
      coreApi.listContentGenerationRequests<GenerationRequestSummary[]>(
        { courseId: active.session.courseId, limit: ACTIVE_REQUEST_SCAN_LIMIT, type: "quiz" },
        claims,
      ),
    ]);
    const selected = learningOutcomes.find((lo) => lo.lo_id === targetId);
    if (!selected) {
      return NextResponse.json({ error: "Learning outcome không thuộc khóa học hiện tại." }, { status: 400 });
    }
    // Yêu cầu treo quá `STALE_REQUEST_MS` không còn chặn: không có đường huỷ,
    // nên nếu vẫn tính là đang chạy thì một worker chết là khoá cứng khoá học.
    if (recentRequests.some((item) => item.type === "quiz" && isActiveRequest(asProgress(item)))) {
      return NextResponse.json(
        { error: "Một yêu cầu sinh quiz đang được xử lý. Vui lòng chờ hoàn tất." },
        { status: 409 },
      );
    }

    const bloom = BLOOM_BY_LEVEL[selected.bloom_level];
    if (!bloom) {
      return NextResponse.json(
        { error: "Learning outcome chưa có mức Bloom hợp lệ (1-6)." },
        { status: 400 },
      );
    }

    const result = await coreApi.createContentGenerationRequest(
      {
        courseId: active.session.courseId,
        type: "quiz",
        scope: {
          target_kind: "lo",
          target_code: selected.lo_id,
          target_label: selected.code,
          count,
          style: "quiz",
          bloom_level: bloom,
        },
      },
      claims,
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return errorResponse(error, "Không thể tạo yêu cầu sinh quiz.");
  }
}
