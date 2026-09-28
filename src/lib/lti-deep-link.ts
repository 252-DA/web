import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { decodeJwt, importPKCS8, SignJWT, type JWTPayload } from "jose";
import { LTI_CONFIG } from "./lti";

export const LTI_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/";
export const DL_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/";
export type DeepLinkState = {
  userId: string;
  courseId: string;
  deploymentId: string;
  moduleId: string;
  returnUrl: string;
  data?: string;
  selectionId: string;
};
export const deepLinkKey = (id: string) => `lti:deep-link:${id}`;

/** Only call with a signature-, state- and nonce-verified platform payload. */
export function deepLinkSettings(payload: JWTPayload, platformUrl: string) {
  const raw = payload[`${DL_CLAIM}deep_linking_settings`];
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Thiếu cấu hình Deep Linking.");
  const settings = raw as Record<string, unknown>;
  if (
    !Array.isArray(settings.accept_types) ||
    !settings.accept_types.includes("ltiResourceLink")
  )
    throw new Error("Canvas không chấp nhận liên kết quiz.");
  if (typeof settings.deep_link_return_url !== "string")
    throw new Error("Thiếu địa chỉ trả về Canvas.");
  const url = new URL(settings.deep_link_return_url);
  const platform = new URL(platformUrl);
  if (
    url.origin !== platform.origin ||
    url.username ||
    url.password ||
    url.hash ||
    !/^https?:$/.test(url.protocol)
  )
    throw new Error("Địa chỉ trả về không thuộc Canvas đã cấu hình.");
  if (settings.data !== undefined && typeof settings.data !== "string")
    throw new Error("Deep Linking data không hợp lệ.");
  // Canvas embeds its one-use module selection in ?data=JWT. The outer LTI
  // signature authenticates this exact URL. Decode only to identify the module;
  // return the original URL untouched so Canvas verifies its own opaque token.
  const opaque = url.searchParams.get("data");
  const moduleId = opaque
    ? decodeJwt(opaque).context_module_id
    : url.searchParams.get("context_module_id");
  if (!/^[1-9]\d*$/.test(String(moduleId ?? "")))
    throw new Error(
      "Hãy mở Sinh quiz bằng DA từ menu ⋮ của một module Canvas.",
    );
  const deploymentId = payload[`${LTI_CLAIM}deployment_id`];
  if (typeof deploymentId !== "string" || !deploymentId)
    throw new Error("Thiếu deployment Canvas.");
  return {
    returnUrl: settings.deep_link_return_url,
    moduleId: String(moduleId),
    deploymentId,
    ...(typeof settings.data === "string" ? { data: settings.data } : {}),
  };
}

type LinkedQuiz = {
  quiz_set_id: string;
  title: string;
  questionCount?: number;
  settings?: {
    mode: "practice" | "exam";
    pointsPossible: number;
    maxAttempts: number | null;
    timeLimitMinutes: number | null;
    availableFrom: string | null;
    availableUntil: string | null;
    dueAt: string | null;
  };
};

/** Mô tả bài tập hiện trong Canvas, để sinh viên biết luật trước khi mở bài. */
function describeQuiz(quiz: LinkedQuiz) {
  const s = quiz.settings;
  const parts = [s?.mode === "exam" ? "Bài kiểm tra DA" : "Bài luyện tập DA"];
  if (quiz.questionCount) parts.push(`${quiz.questionCount} câu`);
  if (s?.mode === "exam") {
    if (s.timeLimitMinutes) parts.push(`${s.timeLimitMinutes} phút`);
    parts.push(s.maxAttempts ? `${s.maxAttempts} lần làm` : "không giới hạn lần làm");
    parts.push("đáp án hiện sau khi đóng bài");
  } else {
    parts.push("được làm lại, Canvas ghi điểm cao nhất");
  }
  return parts.join(" · ");
}

export async function signDeepLinkResponse(
  state: DeepLinkState,
  quiz?: LinkedQuiz,
) {
  const key = await importPKCS8(
    await readFile(LTI_CONFIG.privateKeyPath, "utf8"),
    "RS256",
  );
  const points = quiz?.settings?.pointsPossible ?? 100;
  const settings = quiz?.settings;
  // Canvas đặt unlock_at/lock_at từ `available` và due_at từ
  // `submission.endDateTime` (Lti::IMS::Concerns::DeepLinkingModules).
  const available =
    settings?.availableFrom || settings?.availableUntil
      ? {
          available: {
            ...(settings.availableFrom ? { startDateTime: settings.availableFrom } : {}),
            ...(settings.availableUntil ? { endDateTime: settings.availableUntil } : {}),
          },
        }
      : {};
  const items = quiz
    ? [
        {
          type: "ltiResourceLink",
          title: quiz.title,
          text: describeQuiz(quiz),
          url: new URL(
            `/learn/quizzes/${quiz.quiz_set_id}`,
            LTI_CONFIG.redirectUri,
          ).toString(),
          custom: {
            target_kind: "quiz_set",
            target_id: quiz.quiz_set_id,
            ags_score_maximum: String(points),
          },
          lineItem: {
            scoreMaximum: points,
            label: quiz.title,
            resourceId: quiz.quiz_set_id,
            tag: settings?.mode === "exam" ? "da-exam" : "da-quiz",
          },
          ...available,
          ...(settings?.dueAt
            ? { submission: { endDateTime: settings.dueAt } }
            : {}),
        },
      ]
    : [];
  return new SignJWT({
    [`${LTI_CLAIM}message_type`]: "LtiDeepLinkingResponse",
    [`${LTI_CLAIM}version`]: "1.3.0",
    [`${LTI_CLAIM}deployment_id`]: state.deploymentId,
    [`${DL_CLAIM}content_items`]: items,
    ...(state.data !== undefined ? { [`${DL_CLAIM}data`]: state.data } : {}),
    nonce: randomUUID(),
  })
    .setProtectedHeader({ alg: "RS256", kid: LTI_CONFIG.keyId, typ: "JWT" })
    .setIssuer(LTI_CONFIG.clientId)
    .setAudience(LTI_CONFIG.issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(key);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export function deepLinkForm(returnUrl: string, jwt: string): Response {
  const nonce = randomUUID();
  return new Response(
    `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Trở về Canvas</title><body><p>Đang thêm quiz vào Canvas…</p><form id="return" method="post" action="${escapeHtml(returnUrl)}"><input type="hidden" name="JWT" value="${escapeHtml(jwt)}"><button type="submit">Tiếp tục về Canvas</button></form><script nonce="${nonce}">document.getElementById("return").submit()</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${new URL(returnUrl).origin}; base-uri 'none'; frame-ancestors ${new URL(returnUrl).origin}`,
      },
    },
  );
}
