import { NextRequest, NextResponse } from "next/server";
import { readLtiSession } from "./session";
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
