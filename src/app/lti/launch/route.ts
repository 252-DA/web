import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyPlatformJwt } from "@/lib/lti-platform-jwt";
import { redis } from "@/lib/redis";
import { LTI_CONFIG } from "@/lib/lti";
import { LtiSession, SESSION_TTL, sessionKey } from "@/lib/session";
import { coreApi, CoreApiError } from "@/lib/core-api";
import { deepLinkSettings, deepLinkKey, LTI_CLAIM, type DeepLinkState } from "@/lib/lti-deep-link";
import {
  acceptsAssetProcessor,
  assetProcessorKey,
  assetProcessorSettings,
  PROCESSOR_CUSTOM_KEY,
  type AssetProcessorFlow,
} from "@/lib/lti-asset-processor";

const CUSTOM_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/custom";
const CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context";
const DEPLOYMENT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const RESOURCE_LINK_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/resource_link";
const AGS_CLAIM = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint";
const ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles";
type CookieSameSite = "lax" | "strict" | "none";
type LaunchSyncResponse = {
  internalUserId: string;
  internalCourseId: string;
  lmsCourseRefId?: string;
  courseRole: "instructor" | "learner" | "ta" | "observer";
  resourceLinkId?: string;
};
type PlatformRole = "instructor" | "learner" | "administrator";
type CourseRole = "instructor" | "learner" | "ta" | "observer";

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

function mapRoles(roles: string[]): { role: PlatformRole; courseRole: CourseRole } {
  const joined = roles.join(" ");
  if (/Administrator/i.test(joined)) {
    return { role: "administrator", courseRole: "instructor" };
  }
  if (/Instructor|Faculty|Staff/i.test(joined)) {
    return { role: "instructor", courseRole: "instructor" };
  }
  if (/TeachingAssistant|Teaching Assistant|TA/i.test(joined)) {
    return { role: "instructor", courseRole: "ta" };
  }
  if (/Observer|Mentor/i.test(joined)) {
    return { role: "learner", courseRole: "observer" };
  }
  if (/Learner|Student|Member/i.test(joined)) {
    return { role: "learner", courseRole: "learner" };
  }
  throw new CoreApiError(403, "Unsupported LTI role");
}

function parseTargetKind(value: string | undefined): LtiSession["targetKind"] | undefined {
  if (
    value === "lesson" ||
    value === "card" ||
    value === "quiz_set" ||
    value === "chat" ||
    value === "video"
  ) {
    return value;
  }
  return undefined;
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
    // Canvas resource targets must come from signed claims, never login query params.
    const custom = LTI_CONFIG.lmsType === "canvas" ? tokenCustom : { ...xblockCustom, ...tokenCustom };
    const loIds = custom.lo_ids ? custom.lo_ids.split(",").filter(Boolean) : [];
    const chatbotEnabled = custom.chatbot_enabled !== "false";

    // ── Extract LTI claims ──
    const lmsSub = (payload.sub || "") as string;
    const email = (payload.email || null) as string | null;
    const displayName = (payload.name || null) as string | null;
    const roles = parseRoles(payload[ROLES_CLAIM]);
    const mappedRole = mapRoles(roles);
    const messageType = payload[`${LTI_CLAIM}message_type`];
    // Hai kiểu sau thuộc Asset Processor (chấm bài luận nộp file): giảng viên
    // bấm "Modify" bộ chấm, hoặc ai đó bấm "View report" trong SpeedGrader.
    const isProcessorSettings = messageType === "LtiAssetProcessorSettingsRequest";
    const isReportReview = messageType === "LtiReportReviewRequest";
    if (
      messageType !== "LtiResourceLinkRequest" &&
      messageType !== "LtiDeepLinkingRequest" &&
      !isProcessorSettings &&
      !isReportReview
    )
      throw new Error("Unsupported LTI message type");
    if (payload[`${LTI_CLAIM}version`] !== "1.3.0") throw new Error("Unsupported LTI version");
    const isDeepLink = messageType === "LtiDeepLinkingRequest";
    if ((isDeepLink || isProcessorSettings) && !["instructor", "ta"].includes(mappedRole.courseRole)) throw new CoreApiError(403, "Chỉ giảng viên được thêm quiz vào Canvas.");
    const processorLinking =
      isDeepLink && acceptsAssetProcessor(payload)
        ? assetProcessorSettings(payload, LTI_CONFIG.platformUrl)
        : null;
    const linking = isDeepLink && !processorLinking ? deepLinkSettings(payload, LTI_CONFIG.platformUrl) : null;

    // Context (course) info — from id_token or from XBlock fallback
    const context = (payload[CONTEXT_CLAIM] || {}) as Record<string, unknown>;
    const lmsContextId = (context.id || xblockCourseId) as string;
    const contextTitle =
      typeof context.title === "string"
        ? context.title
        : typeof context.label === "string"
          ? context.label
          : undefined;

    const resourceLink = (payload[RESOURCE_LINK_CLAIM] || {}) as Record<string, unknown>;
    const resourceLinkId =
      typeof resourceLink.id === "string" ? resourceLink.id : custom.resource_link_id;
    const targetKind = isDeepLink ? undefined : parseTargetKind(custom.target_kind);
    const targetId = isDeepLink ? null : custom.target_id || custom.lesson_id || null;

    const ags = (payload[AGS_CLAIM] || {}) as Record<string, unknown>;
    const agsLineItemUrl = typeof ags.lineitem === "string" ? ags.lineitem : undefined;

    // ── Sync with core-api ──
    const sync = await coreApi.launchSync<LaunchSyncResponse>({
      lmsType: LTI_CONFIG.lmsType,
      lmsSub,
      email,
      displayName,
      role: mappedRole.role,
      courseRole: mappedRole.courseRole,
      lmsContextId,
      contextTitle,
      resourceLinkId,
      targetKind,
      targetId,
      customClaims: custom,
      agsLineItemUrl,
      agsScoreMaximum:
        typeof custom.ags_score_maximum === "string"
          ? Number(custom.ags_score_maximum)
          : undefined,
      agsLabel: typeof resourceLink.title === "string" ? resourceLink.title : contextTitle,
    });

    // ── Set Redis session ──
    const session: LtiSession = {
      internalUserId: sync.internalUserId,
      lmsType: LTI_CONFIG.lmsType,
      lmsSub,
      email,
      displayName,
      courseId: sync.internalCourseId,
      lmsContextId,
      role: mappedRole.role,
      courseRole: sync.courseRole || mappedRole.courseRole,
      roles,
      lmsCourseRefId: sync.lmsCourseRefId,
      resourceLinkId: sync.resourceLinkId,
      targetKind,
      targetId,
      loIds,
      chatbotEnabled,
    };

    const sid = randomUUID();
    const flowId = linking || processorLinking ? randomUUID() : undefined;
    if (linking && flowId) {
      const flow: DeepLinkState = { ...linking, userId: session.internalUserId, courseId: session.courseId, selectionId: randomUUID() };
      await redis.setex(deepLinkKey(flowId), SESSION_TTL, JSON.stringify(flow));
    }
    if (processorLinking && flowId) {
      const flow: AssetProcessorFlow = { ...processorLinking, userId: session.internalUserId, courseId: session.courseId };
      await redis.setex(assetProcessorKey(flowId), SESSION_TTL, JSON.stringify(flow));
    }
    await redis.setex(
      sessionKey(sid),
      SESSION_TTL,
      JSON.stringify(session)
    );

    // ── Set session cookie ──
    const sameSite = ltiCookieSameSite();
    const secure = ltiCookieSecure(sameSite);
    const submissionClaim = (payload[`${LTI_CLAIM}submission`] || {}) as { id?: unknown };
    const redirectPath =
      processorLinking
        ? "/lti/asset-processor"
        : isProcessorSettings
          ? `/lti/asset-processor?processor=${encodeURIComponent(custom[PROCESSOR_CUSTOM_KEY] || "")}`
          : isReportReview
            ? `/lti/essay-report?submission=${encodeURIComponent(String(submissionClaim.id || ""))}`
            : isDeepLink
        ? "/lti/deep-link"
        : targetKind === "quiz_set" && targetId
          ? `/learn/quizzes/${targetId}`
          : mappedRole.courseRole === "instructor" || mappedRole.courseRole === "ta"
        ? "/manage/dashboard"
        : targetKind === "lesson" && targetId
          ? `/learn/lessons/${targetId}`
          : `/learn/courses/${sync.internalCourseId}`;
    const redirectUrl = publicToolUrl(redirectPath);
    if (flowId) redirectUrl.searchParams.set("flow", flowId);
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
    console.error("[lti/launch] error:", err instanceof CoreApiError ? err.body : errorMessage(err));
    const status = err instanceof CoreApiError ? (err.status === 403 || err.status === 7 ? 403 : err.status >= 500 ? 502 : 400) : 400;
    return new Response(
      JSON.stringify({ error: "LTI launch failed", detail: errorMessage(err) }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
