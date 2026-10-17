import { NextRequest } from "next/server";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import { CHAT_MODE_INFO, isChatMode } from "@/lib/chat";
import { LTI_CONFIG } from "@/lib/lti";
import { messageFromError, readSessionFromRequest, redirectBack } from "@/lib/route-session";

/** Admin đổi chế độ truy xuất của chatbot (áp dụng cho mọi khóa học, hiệu lực ngay). */
export async function POST(request: NextRequest) {
  const active = await readSessionFromRequest(request);
  if (!active) return redirectBack(request, "/manage/chat", { error: "Phiên đã hết hạn." });
  if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
    return redirectBack(request, "/manage/chat", { error: "Nguồn yêu cầu không hợp lệ." });
  }
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "");
    if (!isChatMode(mode)) return redirectBack(request, "/manage/chat", { error: "Chế độ không hợp lệ." });
    await coreApi.setChatMode({ mode }, claimsFromSession(active.session));
    const info = CHAT_MODE_INFO[mode];
    return redirectBack(request, "/manage/chat", {
      success: `Chatbot đang chạy chế độ ${info.letter} (${info.title}). Có hiệu lực từ câu hỏi kế tiếp.`,
    });
  } catch (error) {
    return redirectBack(request, "/manage/chat", {
      error: messageFromError(error, "Không đổi được chế độ chatbot."),
    });
  }
}
