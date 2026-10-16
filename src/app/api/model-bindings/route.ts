import { NextRequest } from "next/server";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { LTI_CONFIG } from "@/lib/lti";
import { modelTaskLabel } from "@/lib/model-tasks";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

/** Admin chọn model cho một task, hoặc bỏ chọn để task quay về mặc định. */
export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return redirectBack(request, "/manage/models", { error: "Phiên đã hết hạn." });
  }
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return redirectBack(request, "/manage/models", { error: "Nguồn yêu cầu không hợp lệ." });
  }
  try {
    const form = await request.formData();
    const task = String(form.get("task") ?? "");
    const profile = String(form.get("profile") ?? "").trim();
    await coreApi.setModelBinding(
      { task, profile: profile || null },
      claimsFromSession(activeSession.session),
    );
    const label = modelTaskLabel(task).title;
    return redirectBack(request, "/manage/models", {
      success: profile
        ? `${label}: đã chọn ${profile}. Job mới dùng model này sau tối đa 30 giây.`
        : `${label}: đã bỏ chọn, quay về cấu hình mặc định của worker.`,
    });
  } catch (error) {
    return redirectBack(request, "/manage/models", {
      error: messageFromError(error, "Không lưu được lựa chọn model."),
    });
  }
}
