import type { JWTPayload } from "jose";
import { LTI_CONFIG } from "./lti";
import { DL_CLAIM, LTI_CLAIM, signContentItems } from "./lti-deep-link";

/**
 * LTI Asset Processor ("Document Processor" trong Canvas): giảng viên gắn công
 * cụ vào một Assignment nộp file; mỗi lần sinh viên nộp, Canvas gửi thông báo
 * kèm file để công cụ chấm và trả báo cáo về SpeedGrader. Xem
 * docs/essay-asset-processor.md.
 */

export const SUBMISSION_NOTICE = "LtiAssetProcessorSubmissionNotice";
const PNS_CLAIM = `${LTI_CLAIM}platformnotificationservice`;
const ACTIVITY_CLAIM = `${LTI_CLAIM}activity`;
/** Khoá custom Canvas giữ trong content item và gửi lại trong mọi thông báo, launch. */
export const PROCESSOR_CUSTOM_KEY = "da_processor_id";

export type AssetProcessorFlow = {
  userId: string;
  courseId: string;
  deploymentId: string;
  returnUrl: string;
  data?: string;
  pnsUrl: string;
  activityId?: string;
  activityTitle?: string;
};

export const assetProcessorKey = (id: string) => `lti:asset-processor:${id}`;

function samePlatform(raw: string, platformUrl: string) {
  const url = new URL(raw);
  return (
    url.origin === new URL(platformUrl).origin &&
    !url.username &&
    !url.password &&
    /^https?:$/.test(url.protocol)
  );
}

/** Canvas yêu cầu content item ltiAssetProcessor qua accept_types. */
export function acceptsAssetProcessor(payload: JWTPayload) {
  const settings = payload[`${DL_CLAIM}deep_linking_settings`] as { accept_types?: unknown } | undefined;
  return Array.isArray(settings?.accept_types) && settings.accept_types.includes("ltiAssetProcessor");
}

/** Only call with a signature-, state- and nonce-verified platform payload. */
export function assetProcessorSettings(payload: JWTPayload, platformUrl: string) {
  const settings = payload[`${DL_CLAIM}deep_linking_settings`] as Record<string, unknown> | undefined;
  if (!settings || typeof settings.deep_link_return_url !== "string")
    throw new Error("Thiếu địa chỉ trả về Canvas.");
  if (!samePlatform(settings.deep_link_return_url, platformUrl))
    throw new Error("Địa chỉ trả về không thuộc Canvas đã cấu hình.");
  if (settings.data !== undefined && typeof settings.data !== "string")
    throw new Error("Deep Linking data không hợp lệ.");

  // Phải đăng ký nhận thông báo trước khi trả content item: Canvas không gửi
  // lại thông báo của những bài đã nộp trong lúc chưa đăng ký.
  const pns = payload[PNS_CLAIM] as
    | { platform_notification_service_url?: unknown; notice_types_supported?: unknown }
    | undefined;
  const pnsUrl = pns?.platform_notification_service_url;
  if (typeof pnsUrl !== "string" || !samePlatform(pnsUrl, platformUrl))
    throw new Error("Canvas không gửi Platform Notification Service: kiểm tra scope noticehandlers của tool.");
  if (Array.isArray(pns?.notice_types_supported) && !pns.notice_types_supported.includes(SUBMISSION_NOTICE))
    throw new Error("Canvas này không gửi thông báo bài nộp cho Document Processor.");

  const deploymentId = payload[`${LTI_CLAIM}deployment_id`];
  if (typeof deploymentId !== "string" || !deploymentId) throw new Error("Thiếu deployment Canvas.");
  const activity = (payload[ACTIVITY_CLAIM] || {}) as { id?: unknown; title?: unknown };
  return {
    returnUrl: settings.deep_link_return_url,
    deploymentId,
    pnsUrl,
    ...(typeof settings.data === "string" ? { data: settings.data } : {}),
    ...(typeof activity.id === "string" ? { activityId: activity.id } : {}),
    ...(typeof activity.title === "string" ? { activityTitle: activity.title } : {}),
  };
}

/** Địa chỉ Canvas gửi thông báo bài nộp; phải cùng domain với tool. */
export function noticeHandlerUrl() {
  return new URL("/api/lti/notices", LTI_CONFIG.redirectUri).toString();
}

export async function signAssetProcessorResponse(
  flow: AssetProcessorFlow,
  processor: { processor_id: string; title: string; max_score: number; rubric: unknown },
) {
  const tool = (path: string) => new URL(path, LTI_CONFIG.redirectUri).toString();
  const criteria = Array.isArray(processor.rubric) ? processor.rubric.length : 0;
  return signContentItems(flow, [
    {
      type: "ltiAssetProcessor",
      title: processor.title,
      text: `AI chấm theo rubric ${criteria} tiêu chí, tối đa ${processor.max_score} điểm. Điểm chỉ là gợi ý, giảng viên chốt điểm.`.slice(0, 255),
      url: tool("/lti/asset-processor"),
      custom: { [PROCESSOR_CUSTOM_KEY]: processor.processor_id },
      report: { url: tool("/lti/essay-report") },
    },
  ]);
}
