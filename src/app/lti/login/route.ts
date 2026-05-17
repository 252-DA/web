import { NextRequest } from "next/server";
import { LTI_CONFIG } from "@/lib/lti";
import { redis } from "@/lib/redis";

type LoginParams = {
  iss: string | null;
  loginHint: string | null;
  targetLinkUri: string | null;
  ltiMessageHint: string | null;
  custom: string;
  courseId: string;
};

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readLoginParams(request: NextRequest): Promise<LoginParams> {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);

  if (request.method !== "GET" && request.method !== "HEAD") {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && !params.has(key)) {
        params.set(key, value);
      }
    }
  }

  return {
    iss: params.get("iss"),
    loginHint: params.get("login_hint"),
    targetLinkUri: params.get("target_link_uri"),
    ltiMessageHint: params.get("lti_message_hint"),
    custom: params.get("custom") || "",
    courseId: params.get("course_id") || "",
  };
}

/**
 * OIDC Login Initiation
 *
 * XBlock iframe trỏ tới endpoint này với query params:
 *   ?iss=...&login_hint=...&target_link_uri=...&custom=...&course_id=...
 *
 * Custom params từ XBlock được lưu tạm vào Redis (keyed by OIDC state),
 * launch route sẽ đọc lại sau khi platform POST id_token.
 */
async function handleLogin(request: NextRequest) {
  const { iss, loginHint, targetLinkUri, ltiMessageHint, custom, courseId } =
    await readLoginParams(request);

  if (!iss || !loginHint || !targetLinkUri) {
    return new Response(
      JSON.stringify({ error: "Missing required OIDC params: iss, login_hint, target_link_uri" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (normalizeIssuer(iss) !== LTI_CONFIG.issuer) {
    return new Response(
      JSON.stringify({
        error: "Unknown LTI issuer",
        expected: LTI_CONFIG.issuer,
        received: iss,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const nonce = crypto.randomUUID();
  const state = crypto.randomUUID();

  // ── Store XBlock custom params in Redis for launch route ──
  await redis.setex(
    `lti:state:${state}`,
    300, // 5 phút TTL
    JSON.stringify({ custom, course_id: courseId, target_link_uri: targetLinkUri })
  );

  // Build OIDC auth request URL
  const oidcAuthUrl = new URL(LTI_CONFIG.authUrl);
  oidcAuthUrl.searchParams.set("response_type", "id_token");
  oidcAuthUrl.searchParams.set("response_mode", "form_post");
  oidcAuthUrl.searchParams.set("client_id", LTI_CONFIG.clientId);
  oidcAuthUrl.searchParams.set("redirect_uri", LTI_CONFIG.redirectUri);
  oidcAuthUrl.searchParams.set("scope", "openid");
  oidcAuthUrl.searchParams.set("prompt", "none");
  oidcAuthUrl.searchParams.set("login_hint", loginHint);
  oidcAuthUrl.searchParams.set("nonce", nonce);
  oidcAuthUrl.searchParams.set("state", state);
  oidcAuthUrl.searchParams.set("lti_message_hint", ltiMessageHint || targetLinkUri);

  return Response.redirect(oidcAuthUrl.toString());
}

export async function GET(request: NextRequest) {
  return handleLogin(request);
}

export async function POST(request: NextRequest) {
  return handleLogin(request);
}
