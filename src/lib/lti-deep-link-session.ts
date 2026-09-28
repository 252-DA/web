import { NextRequest, NextResponse } from "next/server";
import { readManageSession } from "./session";
import { redis } from "./redis";
import { deepLinkKey, type DeepLinkState } from "./lti-deep-link";
import { CoreApiError, claimsFromSession, coreApi } from "./core-api";
import type { CanvasQuizContext } from "./canvas-quiz";
import type { ContentGenerationRequest } from "./quiz";
import { LTI_CONFIG } from "./lti";

export class DeepLinkError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function deepLinkAccess(flowId?: string, sid?: string) {
  const access = await readManageSession(sid);
  if (access.status !== "active")
    throw new DeepLinkError(
      access.status === "expired"
        ? "Phiên đã hết hạn. Mở lại từ menu module Canvas."
        : "Bạn không có quyền thêm quiz.",
      access.status === "expired" ? 401 : 403,
    );
  if (!flowId || !/^[0-9a-f-]{36}$/i.test(flowId))
    throw new DeepLinkError("Hãy mở từ menu ⋮ của module Canvas.");
  const raw = await redis.get(deepLinkKey(flowId));
  if (!raw)
    throw new DeepLinkError(
      "Phiên thêm quiz đã hết hạn. Mở lại từ module Canvas.",
      410,
    );
  const flow = JSON.parse(raw) as DeepLinkState;
  if (
    flow.userId !== access.active.session.internalUserId ||
    flow.courseId !== access.active.session.courseId
  )
    throw new DeepLinkError(
      "Phiên không khớp khóa học. Mở lại menu của module.",
      403,
    );
  return {
    ...access.active,
    flow,
    flowId,
    claims: claimsFromSession(access.active.session),
  };
}

export function assertToolOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin)
    throw new DeepLinkError("Nguồn yêu cầu không hợp lệ.", 403);
}

export async function loadQuizContext(
  access: Awaited<ReturnType<typeof deepLinkAccess>>,
  chapterId?: string,
) {
  const [context, requests] = await Promise.all([
    coreApi.canvasQuizContext<Omit<CanvasQuizContext, "requests">>(
      {
        courseId: access.flow.courseId,
        moduleId: access.flow.moduleId,
        chapterId,
      },
      access.claims,
    ),
    coreApi.listContentGenerationRequests<ContentGenerationRequest[]>(
      { courseId: access.flow.courseId, type: "quiz", limit: 100 },
      access.claims,
    ),
  ]);
  return { ...context, requests };
}

export function deepLinkError(error: unknown) {
  const status =
    error instanceof DeepLinkError
      ? error.status
      : error instanceof CoreApiError
        ? ({ 3: 400, 7: 403, 5: 404, 6: 409, 16: 401 }[error.status] ?? 502)
        : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Không thể xử lý quiz." },
    { status },
  );
}
