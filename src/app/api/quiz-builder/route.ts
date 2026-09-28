import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readManageSession } from "@/lib/session";
import { LTI_CONFIG } from "@/lib/lti";
import type { QuizBuilderContext } from "@/lib/canvas-quiz";
import { answerKey, isActiveRequest, quizChoices, type ContentGenerationRequest } from "@/lib/quiz";

/** Trang Soạn đề: ma trận LO × Bloom, tài liệu nguồn tự chọn, lưu đề nhiều chương. */

const BLOOM = ["", "remember", "understand", "apply", "analyze", "evaluate", "create"];
const MAX_CELLS = 60;
const MAX_QUESTIONS = 100;
const ORIGIN = "quiz_builder";

class BuilderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function access(request: NextRequest) {
  const result = await readManageSession(request.nextUrl.searchParams.get("sid"));
  if (result.status === "expired") throw new BuilderError("Phiên đã hết hạn. Mở lại DA từ Canvas.", 401);
  if (result.status === "forbidden") throw new BuilderError("Bạn không có quyền soạn đề cho khóa học này.", 403);
  const { session } = result.active;
  if (!session.courseId) throw new BuilderError("Phiên không gắn với khóa học.", 400);
  return { courseId: session.courseId, claims: claimsFromSession(session) };
}

function fail(error: unknown) {
  const status =
    error instanceof BuilderError
      ? error.status
      : error instanceof CoreApiError
        ? ({ 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502)
        : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Không xử lý được yêu cầu." },
    { status },
  );
}

async function load(courseId: string, claims: Awaited<ReturnType<typeof access>>["claims"], loIds: string[]) {
  const [context, requests] = await Promise.all([
    coreApi.quizBuilderContext<QuizBuilderContext>({ courseId, loIds }, claims),
    coreApi.listContentGenerationRequests<ContentGenerationRequest[]>({ courseId, type: "quiz", limit: 100 }, claims),
  ]);
  return {
    ...context,
    // Chỉ theo dõi các đợt sinh của trang này; hộp thoại module có tiến độ riêng.
    requests: (requests ?? []).filter(
      (r) => r.scope && typeof r.scope === "object" && (r.scope as { origin?: unknown }).origin === ORIGIN,
    ),
  };
}

function hasValidAnswer(quiz: { options: unknown; correct_answer: unknown }) {
  return quizChoices(quiz.options).some((c) => answerKey(c.value) === answerKey(quiz.correct_answer));
}

export async function GET(request: NextRequest) {
  try {
    const { courseId, claims } = await access(request);
    const loIds = (request.nextUrl.searchParams.get("loIds") || "").split(",").filter(Boolean);
    return NextResponse.json(await load(courseId, claims, loIds), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin)
      throw new BuilderError("Nguồn yêu cầu không hợp lệ.", 403);
    const { courseId, claims } = await access(request);
    const body = await request.json();

    if (body.action === "generate") {
      const cells: Array<{ lo_id: string; bloom_level: number; count: number }> = Array.isArray(body.cells)
        ? body.cells
        : [];
      const documentIds: unknown[] = Array.isArray(body.documentIds) ? body.documentIds : [];
      const total = cells.reduce((sum, c) => sum + Number(c?.count || 0), 0);
      if (!cells.length || cells.length > MAX_CELLS || total > MAX_QUESTIONS)
        throw new BuilderError(`Ma trận cần 1–${MAX_CELLS} ô và tối đa ${MAX_QUESTIONS} câu mỗi lần sinh.`);
      if (!documentIds.length) throw new BuilderError("Chọn ít nhất một tài liệu nguồn.");
      const context = await load(courseId, claims, []);
      if (context.requests.some((r) => isActiveRequest(r)))
        throw new BuilderError("Đợt sinh trước chưa xong. Chờ xong rồi sinh tiếp.", 409);
      const los = new Map(
        context.chapters.flatMap((c) => c.learningOutcomes.map((lo) => [lo.lo_id, lo] as const)),
      );
      const created: ContentGenerationRequest[] = [];
      // Mỗi ô LO × Bloom là một yêu cầu: worker sinh và kiểm chứng theo từng LO ở một mức.
      for (const cell of cells) {
        const lo = los.get(cell?.lo_id);
        if (!lo || !BLOOM[cell.bloom_level]) throw new BuilderError("Ô ma trận có LO hoặc mức Bloom không hợp lệ.");
        created.push(
          await coreApi.createContentGenerationRequest<ContentGenerationRequest>(
            {
              courseId,
              type: "quiz",
              scope: {
                target_kind: "lo",
                target_code: lo.lo_id,
                target_label: lo.code,
                bloom_level: BLOOM[cell.bloom_level],
                count: Number(cell.count),
                style: "quiz",
                source_document_ids: documentIds,
                origin: ORIGIN,
              },
            },
            claims,
          ),
        );
      }
      return NextResponse.json({ requests: created }, { status: 202 });
    }

    if (body.action === "save") {
      return NextResponse.json(
        await coreApi.createQuizSet(
          {
            courseId,
            chapterIds: body.chapterIds,
            title: body.title,
            quizIds: body.quizIds,
            selectionId: body.selectionId,
            settings: body.settings,
            blueprint: body.blueprint,
          },
          claims,
        ),
      );
    }

    // Duyệt câu: chỉ câu thuộc các LO của khóa (core-api kiểm tra quyền theo khóa).
    const loIds: string[] = Array.isArray(body.loIds) ? body.loIds : [];
    const { quizItems } = await load(courseId, claims, loIds);
    const find = (id: unknown) => quizItems.find((q) => q.quiz_id === id);

    if (body.action === "approveMany") {
      const ids: unknown[] = Array.isArray(body.quizIds) ? body.quizIds : [];
      const quizzes = ids.map(find);
      if (!quizzes.length || quizzes.length > 100 || quizzes.some((q) => !q))
        throw new BuilderError("Danh sách câu hỏi không hợp lệ.");
      const invalid = quizzes.filter((q) => !hasValidAnswer(q!));
      if (invalid.length) throw new BuilderError(`${invalid.length} câu có đáp án không khớp lựa chọn. Sửa trước khi giữ.`);
      for (const q of quizzes) await coreApi.approveQuizItem(q!.quiz_id, claims);
      return NextResponse.json({ approved: quizzes.length });
    }

    const quiz = find(body.quizId);
    if (!quiz) throw new BuilderError("Câu hỏi không thuộc các LO đang soạn.");
    if (body.action === "approve") {
      if (!hasValidAnswer(quiz)) throw new BuilderError("Đáp án đúng không khớp các lựa chọn. Sửa câu hỏi trước.");
      return NextResponse.json(await coreApi.approveQuizItem(quiz.quiz_id, claims));
    }
    if (body.action === "reject")
      return NextResponse.json(await coreApi.rejectQuizItem(quiz.quiz_id, "Loại khi soạn đề", claims));
    if (body.action === "edit") {
      const question = typeof body.question === "string" ? body.question.trim() : "";
      const options: string[] = Array.isArray(body.options)
        ? body.options.map((o: unknown) => (typeof o === "string" ? o.trim() : ""))
        : [];
      if (
        !question ||
        options.length !== 4 ||
        options.some((o) => !o) ||
        new Set(options.map((o) => o.toLowerCase())).size !== 4 ||
        !Number.isInteger(body.correctIndex) ||
        body.correctIndex < 0 ||
        body.correctIndex > 3 ||
        typeof body.explanation !== "string"
      )
        throw new BuilderError("Nhập câu hỏi, bốn phương án khác nhau và đáp án đúng.");
      return NextResponse.json(
        await coreApi.updateQuizItem(
          quiz.quiz_id,
          { question, options, correct_answer: options[body.correctIndex], explanation: body.explanation.trim() },
          claims,
        ),
      );
    }
    throw new BuilderError("Thao tác không hợp lệ.");
  } catch (error) {
    return fail(error);
  }
}
