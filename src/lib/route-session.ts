import { NextRequest, NextResponse } from "next/server";
import { readLtiSession } from "./session";

export async function readSessionFromRequest(request: NextRequest) {
  return readLtiSession(request.nextUrl.searchParams.get("sid"));
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
