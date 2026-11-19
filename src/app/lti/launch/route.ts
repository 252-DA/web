import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyPlatformJwt } from "@/lib/lti-platform-jwt";
import { redis } from "@/lib/redis";
import { LTI_CONFIG, isKnownDeployment } from "@/lib/lti";
import {
  LtiSession,
  SESSION_MAX_AGE,
  SESSION_TTL,
  sessionKey,
  sessionTtlFor,
} from "@/lib/session";
import { mapRoles, UnsupportedRoleError } from "@/lib/lti-roles";
import {
  canViewSubmissions,
  parseSubmissionViewUri,
  submissionViewPath,
} from "@/lib/lti-submission-view";
import { coreApi, CoreApiError, coreApiErrorStatus } from "@/lib/core-api";
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
const NRPS_CLAIM = "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice";
const ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles";
const TARGET_LINK_URI_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/target_link_uri";
type CookieSameSite = "lax" | "strict" | "none";
type LaunchSyncResponse = {
  internalUserId: string;
  internalCourseId: string;
  lmsCourseRefId?: string;
  courseRole: "instructor" | "learner" | "ta" | "observer";
  resourceLinkId?: string;
  /** Thời gian làm của bài kiểm tra đang mở (phút), để phiên thi sống đủ lâu. */
  examTimeLimitMinutes?: number;
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

function parseTargetKind(value: string | undefined): LtiSession["targetKind"] | undefined {
  if (
    value === "lesson" ||
    value === "card" ||
    value === "quiz_set" ||
    value === "chat" ||
    value === "video" ||
    value === "micro_content"
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
    if (!isKnownDeployment(String(deploymentId || ""))) {
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
    // SpeedGrader mở bài nộp basic_lti_launch bằng URL trong điểm AGS; URL đó
    // đi trong target_link_uri đã ký và chỉ giảng viên/trợ giảng được xem.
    const submissionView =
      messageType === "LtiResourceLinkRequest"
        ? parseSubmissionViewUri(
            payload[TARGET_LINK_URI_CLAIM],
            new URL(LTI_CONFIG.redirectUri).origin,
          )
        : null;
    if (submissionView && !canViewSubmissions(mappedRole.role, mappedRole.courseRole)) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="font:14px system-ui,sans-serif;margin:0;padding:24px;color:#334155">' +
          "<p>Trang này là bài làm của sinh viên, chỉ giảng viên và trợ giảng của khóa học xem được.</p>" +
          "<p>Để làm hoặc xem lại bài, hãy mở bài tập từ trang Assignment trong Canvas.</p></body>",
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    const targetKind = submissionView
      ? "quiz_set"
      : isDeepLink
        ? undefined
        : parseTargetKind(custom.target_kind);
    const targetId = submissionView
      ? submissionView.quizSetId
      : isDeepLink
        ? null
        : custom.target_id || custom.lesson_id || null;

    // Nút chat ở thanh trên của Canvas (placement top_navigation) hiện ở mọi trang,
    // kể cả dashboard hay trang tài khoản không thuộc khóa học nào. Chat theo khóa
    // học, nên không có context thì báo rõ thay vì trả JSON lỗi trong ngăn bên.
    if (targetKind === "chat" && !lmsContextId) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="font:14px system-ui,sans-serif;margin:0;padding:24px;color:#334155">' +
          "<p>Trợ giảng AI trả lời dựa trên tài liệu của từng khóa học, nên chỉ dùng được khi đang ở trong một khóa học.</p>" +
          "<p>Hãy mở một khóa học trong Canvas rồi bấm lại nút Trợ giảng AI.</p></body>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const ags = (payload[AGS_CLAIM] || {}) as Record<string, unknown>;
    const agsLineItemUrl = typeof ags.lineitem === "string" ? ags.lineitem : undefined;

    // Claim NRPS chỉ có khi tool đã có scope contextmembership.readonly và launch
    // diễn ra sau khi scope được thêm; core-api lưu URL để đọc danh sách lớp.
    const nrpsClaim = (payload[NRPS_CLAIM] || {}) as Record<string, unknown>;
    const nrps =
      typeof nrpsClaim.context_memberships_url === "string" && nrpsClaim.context_memberships_url
        ? {
            contextMembershipsUrl: nrpsClaim.context_memberships_url,
            serviceVersions: Array.isArray(nrpsClaim.service_versions)
              ? nrpsClaim.service_versions.map(String)
              : undefined,
          }
        : undefined;

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
      // Đường xem bài làm không phải một Assignment của sinh viên: không ghi
      // resource link hay line item; core-api kiểm tra quiz thuộc khóa học khi
      // trả bài làm.
      resourceLinkId: submissionView ? undefined : resourceLinkId,
      targetKind: submissionView ? undefined : targetKind,
      targetId: submissionView ? undefined : targetId,
      customClaims: custom,
      agsLineItemUrl,
      agsScoreMaximum:
        typeof custom.ags_score_maximum === "string"
          ? Number(custom.ags_score_maximum)
          : undefined,
      agsLabel: typeof resourceLink.title === "string" ? resourceLink.title : contextTitle,
      nrps,
    });

    // ── Set Redis session ──
    // Phiên thi sống tối thiểu bằng thời gian làm + 10 phút; mọi phiên được gia
    // hạn trượt mỗi request (readLtiSession).
    const ttlSeconds = sessionTtlFor(sync.examTimeLimitMinutes);
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
      ...(submissionView ? { submissionId: submissionView.submissionId } : {}),
      loIds,
      chatbotEnabled,
      ttlSeconds,
      issuedAt: Math.floor(Date.now() / 1000),
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
    await redis.setex(sessionKey(sid), ttlSeconds, JSON.stringify(session));

    // ── Set session cookie ──
    const sameSite = ltiCookieSameSite();
    const secure = ltiCookieSecure(sameSite);
    const submissionClaim = (payload[`${LTI_CLAIM}submission`] || {}) as { id?: unknown };
    const redirectPath =
      submissionView
        ? submissionViewPath(submissionView.quizSetId, submissionView.submissionId)
        : processorLinking
        ? "/lti/asset-processor"
        : isProcessorSettings
          ? `/lti/asset-processor?processor=${encodeURIComponent(custom[PROCESSOR_CUSTOM_KEY] || "")}`
          : isReportReview
            ? `/lti/essay-report?submission=${encodeURIComponent(String(submissionClaim.id || ""))}`
            : isDeepLink
        ? "/lti/deep-link"
        : targetKind === "chat"
          ? // Mục "Trợ giảng AI" ở menu khóa học mở trang chat đầy đủ (custom chat_layout=page);
            // nút ở thanh trên mở ngăn hẹp.
            custom.chat_layout === "page"
            ? `/learn/courses/${sync.internalCourseId}/chat`
            : `/learn/courses/${sync.internalCourseId}/chat?embed=1`
          : targetKind === "quiz_set" && targetId
          ? `/learn/quizzes/${targetId}`
          : targetKind === "micro_content" && targetId
            ? `/learn/micro-content/${targetId}`
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
      // Cookie không gia hạn được lúc render, nên sống tới trần của phiên; Redis
      // mới quyết định phiên còn hiệu lực (gia hạn trượt trong readLtiSession).
      maxAge: SESSION_MAX_AGE,
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
    const status =
      err instanceof UnsupportedRoleError
        ? 403
        : coreApiErrorStatus(err, 400);
    return new Response(
      JSON.stringify({ error: "LTI launch failed", detail: errorMessage(err) }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
