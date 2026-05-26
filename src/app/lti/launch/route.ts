import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, createVerify, randomUUID } from "crypto";
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { Pool } from "pg";
import { redis } from "@/lib/redis";
import { LTI_CONFIG } from "@/lib/lti";
import { LtiSession, SESSION_TTL, sessionKey } from "@/lib/session";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@postgres:5432/chunking",
});

const CUSTOM_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/custom";
const CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context";
const DEPLOYMENT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles";
type CookieSameSite = "lax" | "strict" | "none";
type Jwk = {
  kty?: string;
  kid?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
};
type Jwks = {
  keys?: Jwk[];
};

function parsePipeCustom(custom: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const pair of custom.split("|")) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      parsed[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return parsed;
}

function parseCustomClaim(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const parsed: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw !== undefined && raw !== null) {
      parsed[key] = String(raw);
    }
  }
  return parsed;
}

function parseRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return typeof value === "string" ? [value] : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ltiCookieSameSite(): CookieSameSite {
  const value = process.env.LTI_COOKIE_SAMESITE?.trim().toLowerCase();
  return value === "none" || value === "strict" ? value : "lax";
}

function ltiCookieSecure(sameSite: CookieSameSite): boolean {
  const value = process.env.LTI_COOKIE_SECURE?.trim().toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production" || sameSite === "none";
}

function publicToolUrl(path: string): URL {
  return new URL(path, LTI_CONFIG.redirectUri);
}

function shouldUseQuerySessionFallback(sameSite: CookieSameSite, secure: boolean): boolean {
  return (
    process.env.LTI_SESSION_QUERY_FALLBACK === "true" ||
    (process.env.NODE_ENV !== "production" && (!secure || sameSite !== "none"))
  );
}

function isWeakRsaKeyError(error: unknown): boolean {
  return errorMessage(error).includes("modulusLength to be 2048 bits or larger");
}

function allowWeakRsaVerification(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.LTI_ALLOW_WEAK_RSA_VERIFICATION === "true"
  );
}

function assertPlatformClaims(payload: JWTPayload): void {
  if (payload.iss !== LTI_CONFIG.issuer) {
    throw new Error(`Unexpected LTI issuer: ${String(payload.iss || "")}`);
  }

  const audiences = Array.isArray(payload.aud)
    ? payload.aud.map(String)
    : typeof payload.aud === "string"
      ? [payload.aud]
      : [];
  if (!audiences.includes(LTI_CONFIG.clientId)) {
    throw new Error("Unexpected LTI audience");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && now >= Number(payload.exp)) {
    throw new Error("LTI id_token is expired");
  }
  if (payload.nbf !== undefined && now < Number(payload.nbf)) {
    throw new Error("LTI id_token is not active yet");
  }
}

async function fetchPlatformJwks(): Promise<Jwks> {
  const response = await fetch(LTI_CONFIG.jwksUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch platform JWKS: HTTP ${response.status}`);
  }
  const jwks = (await response.json()) as Jwks;
  if (!Array.isArray(jwks.keys)) {
    throw new Error("Platform JWKS is missing keys");
  }
  return jwks;
}

async function verifyWeakRsaPlatformJwt(idToken: string): Promise<JWTPayload> {
  const header = decodeProtectedHeader(idToken);
  if (header.alg !== "RS256") {
    throw new Error(`Unsupported LTI id_token alg: ${String(header.alg || "")}`);
  }

  const jwks = await fetchPlatformJwks();
  const jwk = jwks.keys?.find(
    (key) =>
      key.kty === "RSA" &&
      key.n &&
      key.e &&
      (!header.kid || key.kid === header.kid)
  );
  if (!jwk) {
    throw new Error("No matching RSA key found in platform JWKS");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid LTI id_token format");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const valid = verifier.verify(publicKey, Buffer.from(parts[2], "base64url"));
  if (!valid) {
    throw new Error("Invalid LTI id_token signature");
  }

  const payload = decodeJwt(idToken);
  assertPlatformClaims(payload);
  return payload;
}

async function verifyPlatformJwt(idToken: string): Promise<JWTPayload> {
  const platformJwks = createRemoteJWKSet(new URL(LTI_CONFIG.jwksUrl));

  try {
    const { payload } = await jwtVerify(idToken, platformJwks, {
      issuer: LTI_CONFIG.issuer,
      audience: LTI_CONFIG.clientId,
    });
    return payload;
  } catch (error: unknown) {
    if (!isWeakRsaKeyError(error) || !allowWeakRsaVerification()) {
      throw error;
    }

    console.warn(
      "[lti/launch] platform JWKS uses a weak RSA key; using development-only verifier"
    );
    return verifyWeakRsaPlatformJwt(idToken);
  }
}

/**
 * LTI Launch handler
 *
 * Nhận id_token từ platform (POST form body), validate JWT,
 * đọc XBlock custom params từ Redis (lưu bởi login route),
 * upsert LMS user mapping, set Redis session, redirect theo role.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const idToken = formData.get("id_token") as string;
    const state = formData.get("state") as string;

    if (!idToken) {
      const formKeys = Array.from(formData.keys());
      const oauthError = formData.get("error");
      const oauthErrorDescription = formData.get("error_description");
      console.warn("[lti/launch] missing id_token:", {
        formKeys,
        oauthError: typeof oauthError === "string" ? oauthError : null,
        oauthErrorDescription:
          typeof oauthErrorDescription === "string" ? oauthErrorDescription : null,
      });
      return new Response(
        JSON.stringify({
          error: "Missing id_token",
          form_keys: formKeys,
          oauth_error: typeof oauthError === "string" ? oauthError : null,
          oauth_error_description:
            typeof oauthErrorDescription === "string" ? oauthErrorDescription : null,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Read XBlock custom params from Redis (stored by login route) ──
    if (!state) {
      return new Response(
        JSON.stringify({ error: "Missing OIDC state parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stateData = await redis.getdel(`lti:state:${state}`);
    if (!stateData) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired OIDC state (Potential CSRF)" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    let xblockCustom: Record<string, string> = {};
    let xblockCourseId = "";
    let expectedNonce = "";

    try {
      const parsed = JSON.parse(stateData);
      if (parsed.custom) {
        xblockCustom = parsePipeCustom(parsed.custom);
      }
      xblockCourseId = parsed.course_id || "";
      expectedNonce = parsed.nonce || "";
    } catch {
      return new Response(
        JSON.stringify({ error: "Malformed OIDC state data in session" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Validate JWT from platform ──
    const payload = await verifyPlatformJwt(idToken);

    // ── Verify nonce to prevent replay attacks ──
    if (!payload.nonce || payload.nonce !== expectedNonce) {
      return new Response(
        JSON.stringify({ error: "OIDC nonce mismatch (Potential Replay Attack)" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }


    const deploymentId = payload[DEPLOYMENT_CLAIM];
    if (
      LTI_CONFIG.deploymentId &&
      String(deploymentId || "") !== LTI_CONFIG.deploymentId
    ) {
      throw new Error("Invalid LTI deployment_id");
    }

    const tokenCustom = parseCustomClaim(payload[CUSTOM_CLAIM]);
    const custom = { ...tokenCustom, ...xblockCustom };
    const documentId = custom.document_id || null;
    const loIds = custom.lo_ids ? custom.lo_ids.split(",").filter(Boolean) : [];
    const chatbotEnabled = custom.chatbot_enabled !== "false";

    // ── Extract LTI claims ──
    const lmsUserId = (payload.sub || "") as string;
    const email = (payload.email || null) as string | null;
    const displayName = (payload.name || null) as string | null;
    const roles = parseRoles(payload[ROLES_CLAIM]);

    // Context (course) info — from id_token or from XBlock fallback
    const context = (payload[CONTEXT_CLAIM] || {}) as Record<string, unknown>;
    const lmsCourseId = (context.id || xblockCourseId) as string;

    // ── Determine role ──
    const isInstructor = roles.some((r: string) =>
      r.includes("Instructor") || r.includes("Administrator")
    );

    // ── Upsert LMS user mapping in Postgres ──
    const client = await pool.connect();
    let internalUserId: string;
    try {
      const result = await client.query(
        `INSERT INTO lms_user_mappings (lms_type, lms_user_id, email, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lms_type, lms_user_id)
         DO UPDATE SET email = $3, display_name = $4, updated_at = now()
         RETURNING internal_user_id`,
        [LTI_CONFIG.lmsType, lmsUserId, email, displayName]
      );
      internalUserId = result.rows[0].internal_user_id as string;
    } finally {
      client.release();
    }

    // ── Upsert LMS course reference ──
    if (lmsCourseId) {
      const c2 = await pool.connect();
      try {
        await c2.query(
          `INSERT INTO lms_course_ref (lms_type, lms_course_id)
           VALUES ($1, $2)
           ON CONFLICT (lms_type, lms_course_id) DO NOTHING`,
          [LTI_CONFIG.lmsType, lmsCourseId]
        );
      } finally {
        c2.release();
      }
    }

    // ── Set Redis session ──
    const session: LtiSession = {
      internalUserId,
      lmsType: LTI_CONFIG.lmsType,
      lmsUserId,
      email,
      displayName,
      courseId: lmsCourseId,
      roles,
      documentId,
      loIds,
      chatbotEnabled,
    };

    const sid = randomUUID();
    await redis.setex(
      sessionKey(sid),
      SESSION_TTL,
      JSON.stringify(session)
    );

    // ── Set session cookie ──
    const sameSite = ltiCookieSameSite();
    const secure = ltiCookieSecure(sameSite);
    const redirectUrl = publicToolUrl(isInstructor ? "/manage/review" : "/learn/cards");
    if (shouldUseQuerySessionFallback(sameSite, secure)) {
      redirectUrl.searchParams.set("sid", sid);
    }

    const response = NextResponse.redirect(redirectUrl, 303);
    response.cookies.set("sid", sid, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: SESSION_TTL,
      path: "/",
    });

    // ── Enable CHIPS (Cookies Having Independent Partitioned State) ──
    if (secure && sameSite === "none") {
      const setCookie = response.headers.get("Set-Cookie");
      if (setCookie) {
        response.headers.set("Set-Cookie", `${setCookie}; Partitioned`);
      }
    }


    return response;
  } catch (err: unknown) {
    console.error("[lti/launch] error:", errorMessage(err));
    return new Response(
      JSON.stringify({ error: "LTI launch failed", detail: errorMessage(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
