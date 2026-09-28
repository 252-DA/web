import { NextRequest, NextResponse } from "next/server";
import { coreApi } from "@/lib/core-api";
import {
  assertToolOrigin,
  deepLinkAccess,
  deepLinkError,
  DeepLinkError,
  loadQuizContext,
} from "@/lib/lti-deep-link-session";
import { answerKey, isActiveRequest, quizChoices } from "@/lib/quiz";

const BLOOM = ["", "remember", "understand", "apply", "analyze", "evaluate", "create"];

function chapterOf(scope: unknown) {
  return scope && typeof scope === "object" && "chapter_id" in scope
    ? String((scope as { chapter_id: unknown }).chapter_id)
    : null;
}

function hasValidAnswer(quiz: { options: unknown; correct_answer: unknown }) {
  return quizChoices(quiz.options).some(
    (c) => answerKey(c.value) === answerKey(quiz.correct_answer),
  );
}

function access(request: NextRequest) {
  return deepLinkAccess(
    request.nextUrl.searchParams.get("flow") || undefined,
    request.nextUrl.searchParams.get("sid") || undefined,
  );
}
export async function GET(request: NextRequest) {
  try {
    const active = await access(request);
    return NextResponse.json(
      await loadQuizContext(
        active,
        request.nextUrl.searchParams.get("chapterId") || undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return deepLinkError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    assertToolOrigin(request);
    const active = await access(request);
    const body = await request.json();
    const context = await loadQuizContext(
      active,
      typeof body.chapterId === "string" ? body.chapterId : undefined,
    );
    if (!context.chapter)
      throw new DeepLinkError("Chọn chương tương ứng trong đề cương.");
    if (body.action === "generate") {
      // Một lần bấm sinh cho nhiều LO của chương; mỗi LO một yêu cầu vì worker
      // sinh và kiểm chứng theo từng LO.
      const targetIds: unknown[] = Array.isArray(body.targetIds)
        ? body.targetIds
        : [body.targetId];
      const los = targetIds.map((id) =>
        context.learningOutcomes.find((item) => item.lo_id === id),
      );
      if (!los.length || los.length > 10 || los.some((lo) => !lo))
        throw new DeepLinkError("Chọn 1–10 LO thuộc chương.");
      const bloomLevel = body.bloomLevel;
      if (
        !Number.isInteger(body.count) ||
        body.count < 1 ||
        body.count > 10 ||
        (bloomLevel !== "auto" &&
          (!Number.isInteger(bloomLevel) || bloomLevel < 1 || bloomLevel > 6))
      )
        throw new DeepLinkError("Chọn 1–10 câu mỗi LO và mức Bloom hợp lệ.");
      // Chỉ chặn khi chính chương này đang sinh; yêu cầu của chương khác
      // không liên quan tới hộp thoại đang mở.
      if (
        context.requests.some(
          (item) =>
            isActiveRequest(item) &&
            chapterOf(item.scope) === context.chapter!.chapter_id,
        )
      )
        throw new DeepLinkError(
          "Chương này đang sinh câu hỏi. Chờ xong rồi sinh tiếp.",
          409,
        );
      const created = [];
      for (const lo of los as NonNullable<(typeof los)[number]>[]) {
        const level = bloomLevel === "auto" ? lo.bloom_level || 2 : bloomLevel;
        created.push(
          await coreApi.createContentGenerationRequest(
            {
              courseId: active.flow.courseId,
              type: "quiz",
              scope: {
                target_kind: "lo",
                target_code: lo.lo_id,
                target_label: lo.code,
                chapter_id: context.chapter.chapter_id,
                count: body.count,
                bloom_level: BLOOM[level] ?? "understand",
                style: "quiz",
              },
            },
            active.claims,
          ),
        );
      }
      return NextResponse.json({ requests: created }, { status: 202 });
    }
    if (body.action === "approveMany") {
      const ids: unknown[] = Array.isArray(body.quizIds) ? body.quizIds : [];
      const quizzes = ids.map((id) =>
        context.quizItems.find((item) => item.quiz_id === id),
      );
      if (!quizzes.length || quizzes.length > 50 || quizzes.some((q) => !q))
        throw new DeepLinkError("Danh sách câu hỏi không thuộc chương.");
      const invalid = quizzes.filter((q) => !hasValidAnswer(q!));
      if (invalid.length)
        throw new DeepLinkError(
          `${invalid.length} câu có đáp án không khớp lựa chọn. Sửa trước khi giữ.`,
        );
      for (const quiz of quizzes)
        await coreApi.approveQuizItem(quiz!.quiz_id, active.claims);
      return NextResponse.json({ approved: quizzes.length });
    }
    const quiz = context.quizItems.find((item) => item.quiz_id === body.quizId);
    if (!quiz) throw new DeepLinkError("Câu hỏi không thuộc chương.");
    if (body.action === "approve") {
      if (!hasValidAnswer(quiz))
        throw new DeepLinkError(
          "Đáp án đúng không khớp các lựa chọn. Sửa câu hỏi trước khi duyệt.",
        );
      return NextResponse.json(
        await coreApi.approveQuizItem(quiz.quiz_id, active.claims),
      );
    }
    if (body.action === "edit") {
      const question =
        typeof body.question === "string" ? body.question.trim() : "";
      const options = Array.isArray(body.options)
        ? body.options.map((o: unknown) =>
            typeof o === "string" ? o.trim() : "",
          )
        : [];
      if (
        !question ||
        options.length !== 4 ||
        options.some((o: string) => !o) ||
        new Set(options.map((o: string) => o.toLowerCase())).size !== 4 ||
        !Number.isInteger(body.correctIndex) ||
        body.correctIndex < 0 ||
        body.correctIndex > 3 ||
        typeof body.explanation !== "string"
      )
        throw new DeepLinkError(
          "Nhập câu hỏi, bốn phương án khác nhau và đáp án đúng.",
        );
      return NextResponse.json(
        await coreApi.updateQuizItem(
          quiz.quiz_id,
          {
            question,
            options,
            correct_answer: options[body.correctIndex],
            explanation: body.explanation.trim(),
          },
          active.claims,
        ),
      );
    }
    if (body.action === "reject")
      return NextResponse.json(
        await coreApi.rejectQuizItem(
          quiz.quiz_id,
          "Cần chỉnh sửa trước khi đưa vào Canvas",
          active.claims,
        ),
      );
    throw new DeepLinkError("Thao tác không hợp lệ.");
  } catch (error) {
    return deepLinkError(error);
  }
}
