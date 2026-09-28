import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { redis } from "@/lib/redis";
import { coreApi } from "@/lib/core-api";
import { deepLinkForm, signDeepLinkResponse } from "@/lib/lti-deep-link";
import {
  assertToolOrigin,
  deepLinkAccess,
  deepLinkError,
  DeepLinkError,
  loadQuizContext,
} from "@/lib/lti-deep-link-session";

export async function POST(request: NextRequest) {
  let lockKey: string | undefined;
  const lockValue = randomUUID();
  try {
    assertToolOrigin(request);
    const active = await deepLinkAccess(
      request.nextUrl.searchParams.get("flow") || undefined,
      request.nextUrl.searchParams.get("sid") || undefined,
    );
    const resultKey = `lti:deep-link-result:${active.flowId}`;
    const existing = await redis.get(resultKey);
    if (existing) return deepLinkForm(active.flow.returnUrl, existing);
    lockKey = `lti:deep-link-lock:${active.flowId}`;
    if (!(await redis.set(lockKey, lockValue, "EX", 180, "NX")))
      throw new DeepLinkError("Đang thêm quiz. Vui lòng chờ.", 409);
    const form = await request.formData();
    let quiz: Parameters<typeof signDeepLinkResponse>[1];
    if (form.get("cancel") !== "true") {
      const context = await loadQuizContext(
        active,
        String(form.get("chapterId") || "") || undefined,
      );
      const existingId = String(form.get("quizSetId") || "");
      if (existingId) {
        // Đề đã lưu của khóa (kể cả đề nhiều chương) thêm được vào module bất kỳ.
        quiz = context.quizSets.find((set) => set.quiz_set_id === existingId);
        if (!quiz) throw new DeepLinkError("Quiz không thuộc khóa học này.");
      } else {
        if (!context.chapter) throw new DeepLinkError("Chưa chọn chương.");
        quiz = await coreApi.createQuizSet(
          {
            courseId: active.flow.courseId,
            chapterId: context.chapter.chapter_id,
            title: String(form.get("title") || ""),
            quizIds: JSON.parse(String(form.get("quizIds") || "[]")),
            selectionId: active.flow.selectionId,
            // Core-api kiểm tra lại toàn bộ cài đặt; form chỉ chuyển nguyên giá trị.
            settings: {
              mode: String(form.get("mode") || "practice"),
              pointsPossible: String(form.get("pointsPossible") || ""),
              maxAttempts: String(form.get("maxAttempts") || ""),
              timeLimitMinutes: String(form.get("timeLimitMinutes") || ""),
              shuffle: form.get("shuffle") === "true",
              availableFrom: String(form.get("availableFrom") || ""),
              availableUntil: String(form.get("availableUntil") || ""),
              dueAt: String(form.get("dueAt") || ""),
            },
          },
          active.claims,
        );
      }
    }
    const jwt = await signDeepLinkResponse(active.flow, quiz);
    await redis.setex(resultKey, 300, jwt);
    return deepLinkForm(active.flow.returnUrl, jwt);
  } catch (error) {
    return deepLinkError(error);
  } finally {
    if (lockKey)
      await redis.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockValue,
      );
  }
}
