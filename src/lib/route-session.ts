import { NextRequest, NextResponse } from "next/server";
import { claimsFromSession, coreApiErrorStatus } from "./core-api";
import { readLtiSession, readManageSession } from "./session";
import { LTI_CONFIG } from "./lti";

export async function readSessionFromRequest(request: NextRequest) {
  return readLtiSession(request.nextUrl.searchParams.get("sid"));
}

export function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    if (new URL(LTI_CONFIG.redirectUri).origin === origin) return true;
  } catch {}

  try {
    if (publicOrigin(request) === origin) return true;
  } catch {}

  try {
    if (request.nextUrl.origin === origin) return true;
  } catch {}

  if (process.env.NODE_ENV !== "production") {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return true;
      }
    } catch {}
  }

  return false;
}

type RedirectMessage = {
  success?: string;
  error?: string;
};

export function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

// Sau Cloudflare tunnel, request.nextUrl.origin là địa chỉ trong container
// (0.0.0.0:3000); origin người dùng thấy nằm ở X-Forwarded-Host / Host.
function publicOrigin(request: NextRequest) {
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host"));
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : request.nextUrl.protocol.replace(":", "");
  if (!host) return request.nextUrl.origin;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return request.nextUrl.origin;
  }
}

export function redirectBack(
  request: NextRequest,
  fallback: string,
  message: RedirectMessage = {},
) {
  const origin = publicOrigin(request);
  const fallbackUrl = new URL(fallback, origin);
  const referer = request.headers.get("referer");
  let target = fallbackUrl;

  if (referer) {
    try {
      const candidate = new URL(referer);
      if (candidate.origin === origin) target = candidate;
    } catch {
      target = fallbackUrl;
    }
  }

  target.searchParams.delete("reviewSuccess");
  target.searchParams.delete("reviewError");
  const sid = request.nextUrl.searchParams.get("sid");
  if (sid) target.searchParams.set("sid", sid);
  if (message.success) target.searchParams.set("reviewSuccess", message.success);
  if (message.error) target.searchParams.set("reviewError", message.error);
  return NextResponse.redirect(target, 303);
}

export async function readManageApiSession(request: NextRequest, checkOrigin = false) {
  if (checkOrigin && !isValidOrigin(request)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 }),
    };
  }
  const result = await readManageSession(request.nextUrl.searchParams.get("sid"));
  if (result.status === "expired") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Phiên đã hết hạn." }, { status: 401 }),
    };
  }
  if (result.status === "forbidden") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Bạn không có quyền truy cập ngân hàng câu hỏi." }, { status: 403 }),
    };
  }
  const { session } = result.active;
  return {
    ok: true as const,
    session,
    claims: claimsFromSession(session),
  };
}

export function manageApiError(error: unknown, fallback: string) {
  const status = coreApiErrorStatus(error, 500);
  return NextResponse.json(
    { error: messageFromError(error, fallback) },
    { status },
  );
}
