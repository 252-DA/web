import { NextRequest, NextResponse } from "next/server";
import type { JWTPayload } from "jose";
import { coreApi } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { LTI_CLAIM } from "@/lib/lti-deep-link";
import { PROCESSOR_CUSTOM_KEY, SUBMISSION_NOTICE } from "@/lib/lti-asset-processor";
import { verifyPlatformJwt } from "@/lib/lti-platform-jwt";

/**
 * Platform Notification Service: Canvas POST `{notices: [{jwt}]}` tới đây khi
 * sinh viên nộp bài vào Assignment có gắn bộ chấm. Endpoint công khai, không
 * có phiên: tin cậy dựa trên chữ ký của từng JWT (JWKS của platform, issuer,
 * audience = client_id của tool).
 *
 * Canvas không gửi lại thông báo, nên chỉ xác minh rồi chuyển cho core-api ghi
 * xuống DB và trả lời ngay; tải file và chấm chạy nền.
 */

type Asset = {
  asset_id?: unknown;
  url?: unknown;
  title?: unknown;
  content_type?: unknown;
  size?: unknown;
  sha256_checksum?: unknown;
};

function claim<T>(payload: JWTPayload, name: string) {
  return (payload[`${LTI_CLAIM}${name}`] ?? {}) as T;
}

function submissionNotice(payload: JWTPayload) {
  const notice = claim<{ id?: unknown; type?: unknown }>(payload, "notice");
  if (notice.type !== SUBMISSION_NOTICE) return null;
  const custom = claim<Record<string, unknown>>(payload, "custom");
  const assets = claim<{ assets?: Asset[] }>(payload, "assetservice").assets ?? [];
  return {
    noticeId: String(notice.id ?? ""),
    processorId: String(custom[PROCESSOR_CUSTOM_KEY] ?? ""),
    submissionId: String(claim<{ id?: unknown }>(payload, "submission").id ?? ""),
    userSub: String(claim<{ user_id?: unknown }>(payload, "for_user").user_id ?? ""),
    reportUrl: String(claim<{ report_url?: unknown }>(payload, "assetreport").report_url ?? ""),
    assets: assets
      .filter((a) => typeof a.asset_id === "string" && typeof a.url === "string")
      .map((a) => ({
        asset_id: a.asset_id as string,
        url: a.url as string,
        title: typeof a.title === "string" ? a.title : null,
        content_type: typeof a.content_type === "string" ? a.content_type : null,
        size: typeof a.size === "number" ? a.size : null,
        sha256_checksum: typeof a.sha256_checksum === "string" ? a.sha256_checksum : null,
      })),
  };
}

export async function POST(request: NextRequest) {
  let body: { notices?: Array<{ jwt?: unknown }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body phải là JSON." }, { status: 400 });
  }
  const tokens = (Array.isArray(body.notices) ? body.notices : [])
    .map((n) => n?.jwt)
    .filter((jwt): jwt is string => typeof jwt === "string");

  const notices = [];
  let rejected = 0;
  for (const jwt of tokens) {
    try {
      const payload = await verifyPlatformJwt(jwt);
      const deployment = payload[`${LTI_CLAIM}deployment_id`];
      if (LTI_CONFIG.deploymentId && String(deployment || "") !== LTI_CONFIG.deploymentId) {
        throw new Error("Sai deployment_id");
      }
      const notice = submissionNotice(payload);
      if (notice && notice.noticeId && notice.processorId && notice.submissionId && notice.userSub) {
        notices.push(notice);
      }
    } catch (error) {
      rejected += 1;
      console.warn("[lti/notices] bỏ thông báo không hợp lệ:", error instanceof Error ? error.message : error);
    }
  }
  if (tokens.length > 0 && rejected === tokens.length) {
    return NextResponse.json({ error: "Không có thông báo hợp lệ." }, { status: 401 });
  }
  if (notices.length === 0) return NextResponse.json({ received: tokens.length, accepted: 0 });

  try {
    const result = await coreApi.receiveAssetNotices(notices);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[lti/notices] core-api lỗi:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Không ghi được thông báo." }, { status: 502 });
  }
}
