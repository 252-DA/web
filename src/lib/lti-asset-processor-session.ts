import { readManageSession } from "./session";
import { redis } from "./redis";
import { claimsFromSession } from "./core-api";
import { assetProcessorKey, type AssetProcessorFlow } from "./lti-asset-processor";
import { DeepLinkError } from "./lti-deep-link-session";

export type EssayRubricRow = { criterion: string; description: string; points: number };
export type EssayProcessor = {
  processor_id: string;
  course_id: string;
  title: string;
  instructions: string;
  rubric: EssayRubricRow[];
  max_score: number;
  visible_to_owner: boolean;
};

/** Số dòng rubric trên form: form HTML thuần, không cần JavaScript để thêm dòng. */
export const RUBRIC_ROWS = 8;

async function manageAccess(sid?: string) {
  const access = await readManageSession(sid);
  if (access.status !== "active")
    throw new DeepLinkError(
      access.status === "expired"
        ? "Phiên đã hết hạn. Mở lại từ trang Assignment trên Canvas."
        : "Chỉ giảng viên được cấu hình bộ chấm.",
      access.status === "expired" ? 401 : 403,
    );
  return { ...access.active, claims: claimsFromSession(access.active.session) };
}

/** Giảng viên đang gắn bộ chấm mới (deep linking từ trang sửa Assignment). */
export async function assetProcessorFlowAccess(flowId?: string, sid?: string) {
  const access = await manageAccess(sid);
  if (!flowId || !/^[0-9a-f-]{36}$/i.test(flowId))
    throw new DeepLinkError("Hãy mở từ nút Document Processor trên trang Assignment.");
  const raw = await redis.get(assetProcessorKey(flowId));
  if (!raw) throw new DeepLinkError("Phiên gắn bộ chấm đã hết hạn. Mở lại từ trang Assignment.", 410);
  const flow = JSON.parse(raw) as AssetProcessorFlow;
  if (flow.userId !== access.session.internalUserId || flow.courseId !== access.session.courseId)
    throw new DeepLinkError("Phiên không khớp khóa học. Mở lại từ trang Assignment.", 403);
  return { ...access, flow, flowId };
}

/** Giảng viên sửa bộ chấm đã gắn (LtiAssetProcessorSettingsRequest). */
export async function assetProcessorEditAccess(processorId?: string, sid?: string) {
  const access = await manageAccess(sid);
  if (!processorId || !/^[0-9a-f-]{36}$/i.test(processorId))
    throw new DeepLinkError("Thiếu mã bộ chấm. Mở lại từ trang Assignment.");
  return { ...access, processorId };
}

/** Đọc rubric từ các ô criterion_i / description_i / points_i; dòng trống bị bỏ. */
export function rubricFromForm(form: FormData): EssayRubricRow[] {
  const rows: EssayRubricRow[] = [];
  for (let i = 0; i < RUBRIC_ROWS; i += 1) {
    const criterion = String(form.get(`criterion_${i}`) ?? "").trim();
    const description = String(form.get(`description_${i}`) ?? "").trim();
    const points = String(form.get(`points_${i}`) ?? "").trim();
    if (!criterion && !points) continue;
    rows.push({ criterion, description, points: Number(points.replace(",", ".")) });
  }
  return rows;
}

export function processorFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? "").trim(),
    instructions: String(form.get("instructions") ?? "").trim(),
    rubric: rubricFromForm(form),
    visibleToOwner: form.get("visibleToOwner") === "on",
  };
}
