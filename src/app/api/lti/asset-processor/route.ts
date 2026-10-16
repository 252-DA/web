import { NextRequest } from "next/server";
import { coreApi } from "@/lib/core-api";
import { redis } from "@/lib/redis";
import { deepLinkForm } from "@/lib/lti-deep-link";
import { assertToolOrigin } from "@/lib/lti-deep-link-session";
import {
  assetProcessorKey,
  noticeHandlerUrl,
  signAssetProcessorResponse,
} from "@/lib/lti-asset-processor";
import {
  assetProcessorEditAccess,
  assetProcessorFlowAccess,
  processorFromForm,
  type EssayProcessor,
} from "@/lib/lti-asset-processor-session";
import { messageFromError, redirectBack } from "@/lib/route-session";

/**
 * Lưu cấu hình bộ chấm bài luận.
 *  ?flow=…       gắn mới: core-api đăng ký nhận thông báo với Canvas và lưu
 *                bộ chấm, rồi trả content item ltiAssetProcessor về Canvas
 *  ?processor=…  sửa bộ chấm đã gắn, ở lại trang
 */
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sid = params.get("sid") || undefined;
  const processorId = params.get("processor") || undefined;
  try {
    assertToolOrigin(request);
    const form = await request.formData();
    const input = processorFromForm(form);

    if (processorId) {
      const access = await assetProcessorEditAccess(processorId, sid);
      await coreApi.updateEssayProcessor({ processorId, ...input }, access.claims);
      return redirectBack(request, "/lti/asset-processor", {
        success: "Đã lưu. Các bài nộp sau sẽ chấm theo rubric mới.",
      });
    }

    const access = await assetProcessorFlowAccess(params.get("flow") || undefined, sid);
    const processor = await coreApi.createEssayProcessor<EssayProcessor>(
      {
        courseId: access.flow.courseId,
        activityId: access.flow.activityId,
        pnsUrl: access.flow.pnsUrl,
        handlerUrl: noticeHandlerUrl(),
        ...input,
      },
      access.claims,
    );
    const jwt = await signAssetProcessorResponse(access.flow, processor);
    await redis.del(assetProcessorKey(access.flowId));
    return deepLinkForm(access.flow.returnUrl, jwt, "Đang gắn bộ chấm vào bài tập Canvas…");
  } catch (error) {
    return redirectBack(request, "/lti/asset-processor", {
      error: messageFromError(error, "Không lưu được bộ chấm."),
    });
  }
}
