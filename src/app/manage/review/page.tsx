import { InstructorNav } from "@/components/instructor-nav";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import {
  answerKey,
  bloomLabel,
  quizChoices,
  type ContentGenerationRequest,
  type LearningOutcomeOption,
} from "@/lib/quiz";
import { readManageSession } from "@/lib/session";
import { QuizGenerationPanel } from "./components/quiz-generation-panel";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type LessonRef = { lesson_id: string; title: string };
type LearningOutcomeRef = {
  lo_id: string;
  code: string;
  statement_vi: string;
  bloom_level: number;
};
type CardDraft = {
  card_id: string;
  title: string | null;
  status: string;
  content: unknown;
  lessons?: LessonRef;
};
type QuizDraft = {
  quiz_id: string;
  question: string;
  status: string;
  type: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  bloom_level: number | null;
  source_chunk_ids: string[];
  lessons?: LessonRef;
  learning_outcomes?: LearningOutcomeRef | null;
};
type Drafts = { cards: CardDraft[]; quizItems: QuizDraft[] };
type RawLearningOutcome = LearningOutcomeRef & { chapters?: { title?: string } };

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function insight(content: unknown) {
  if (!content || typeof content !== "object") return "";
  const data = content as { key_insight?: unknown; keyInsight?: unknown };
  return String(data.key_insight || data.keyInsight || "");
}

function statusMeta(status: string) {
  switch (status) {
    case "APPROVED":
      return { label: "Sẵn sàng publish", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    case "CHANGES_REQUESTED":
      return { label: "Cần chỉnh sửa", className: "border-red-200 bg-red-50 text-red-800" };
    case "REVIEWING":
      return { label: "Đang review", className: "border-sky-200 bg-sky-50 text-sky-800" };
    default:
      return { label: "Bản nháp AI", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }
}

export default async function ReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền quản lý khóa học này.</main>;
  }

  const { sid, session } = access.active;
  const claims = claimsFromSession(session);
  let drafts: Drafts = { cards: [], quizItems: [] };
  let error = "";
  try {
    drafts = await coreApi.listReviewDrafts<Drafts>({ courseId: session.courseId }, claims);
  } catch (err) {
    error = err instanceof Error ? err.message : "Không thể tải review inbox.";
  }

  const [rawLearningOutcomes, recentRequests] = await Promise.all([
    coreApi.listLearningOutcomes<RawLearningOutcome[]>(session.courseId, claims).catch(() => []),
    coreApi
      .listContentGenerationRequests<ContentGenerationRequest[]>(
        { courseId: session.courseId, limit: 20, type: "quiz" },
        claims,
      )
      .then((requests) => requests.filter((request) => request.type === "quiz"))
      .catch(() => []),
  ]);
  const learningOutcomes: LearningOutcomeOption[] = rawLearningOutcomes.map((lo) => ({
    lo_id: lo.lo_id,
    code: lo.code,
    statement_vi: lo.statement_vi,
    bloom_level: lo.bloom_level,
    chapter_title: lo.chapters?.title,
  }));

  const lessonIds = Array.from(
    new Set([
      ...drafts.cards.map((card) => card.lessons?.lesson_id).filter(Boolean),
      ...drafts.quizItems.map((quiz) => quiz.lessons?.lesson_id).filter(Boolean),
    ]),
  ) as string[];
  const approvedCount = [...drafts.cards, ...drafts.quizItems].filter((item) => item.status === "APPROVED").length;
  const waitingCount = drafts.cards.length + drafts.quizItems.length - approvedCount;
  const actionError = first(sp.reviewError);
  const actionSuccess = first(sp.reviewSuccess);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Instructor workspace</p>
          <h1 className="mt-1 text-2xl font-semibold">Sinh quiz & review nội dung</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tạo câu hỏi từ tài liệu khóa học, kiểm tra đáp án và giải thích trước khi publish.
          </p>
          <InstructorNav active="review" courseId={session.courseId} sid={sid} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <QuizGenerationPanel
          courseId={session.courseId}
          sid={sid}
          learningOutcomes={learningOutcomes}
          initialRequests={recentRequests}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chờ review</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{waitingCount}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Sẵn sàng publish</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-emerald-950">{approvedCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lessons trong inbox</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{lessonIds.length}</p>
          </div>
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {actionSuccess && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>}

        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Review inbox</p>
            <h2 className="mt-1 text-xl font-semibold">Quiz và cards theo lesson</h2>
          </div>
          <p className="text-sm text-slate-500">{drafts.quizItems.length} quiz · {drafts.cards.length} cards</p>
        </div>

        {lessonIds.map((lessonId) => {
          const cards = drafts.cards.filter((card) => card.lessons?.lesson_id === lessonId);
          const quizzes = drafts.quizItems.filter((quiz) => quiz.lessons?.lesson_id === lessonId);
          const title = cards[0]?.lessons?.title || quizzes[0]?.lessons?.title || "Lesson";
          const ready = [...cards, ...quizzes].filter((item) => item.status === "APPROVED").length;
          const pending = cards.length + quizzes.length - ready;

          return (
            <section key={lessonId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {quizzes.length} quiz · {cards.length} cards · {ready} đã duyệt
                  </p>
                  {pending > 0 && ready > 0 && (
                    <p className="mt-2 text-xs text-amber-700">Publish lúc này chỉ đưa {ready} mục đã approve sang learner view.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:border-slate-500"
                    href={withSid(`/manage/lessons/${lessonId}/edit`, sid)}
                  >
                    Chỉnh sửa chi tiết
                  </a>
                  <form method="post" action={withSid(`/api/lessons/${lessonId}/publish`, sid)}>
                    <button
                      disabled={ready === 0}
                      className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Publish {ready > 0 ? `${ready} mục` : ""}
                    </button>
                  </form>
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {quizzes.map((quiz, quizIndex) => {
                  const choices = quizChoices(quiz.options);
                  const correctKey = answerKey(quiz.correct_answer);
                  const correctFound = choices.some((choice) => answerKey(choice.value) === correctKey);
                  const meta = statusMeta(quiz.status);
                  return (
                    <article key={quiz.quiz_id} className="p-5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold uppercase tracking-wide text-slate-500">Câu {quizIndex + 1}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600">AI generated</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-600">{quiz.type}</span>
                        <span className={`rounded-full border px-2 py-0.5 font-semibold ${meta.className}`}>{meta.label}</span>
                      </div>

                      <h4 className="mt-3 text-base font-semibold leading-7 text-slate-950">{quiz.question}</h4>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {choices.map((choice, index) => {
                          const isCorrect = answerKey(choice.value) === correctKey;
                          return (
                            <div
                              key={`${choice.key}-${index}`}
                              className={
                                isCorrect
                                  ? "flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"
                                  : "flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                              }
                            >
                              <span className={isCorrect ? "font-bold text-emerald-700" : "font-semibold text-slate-400"}>
                                {String.fromCharCode(65 + index)}
                              </span>
                              <span className="flex-1">{choice.label}</span>
                              {isCorrect && <span className="font-semibold text-emerald-700">Đáp án đúng</span>}
                            </div>
                          );
                        })}
                      </div>
                      {!correctFound && (
                        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                          Đáp án đúng không khớp với các lựa chọn: {String(quiz.correct_answer)}
                        </p>
                      )}

                      <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-[1fr_auto]">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Giải thích</p>
                          <p className="mt-1 text-sm leading-6 text-slate-700">{quiz.explanation || "Chưa có giải thích."}</p>
                        </div>
                        <div className="text-xs text-slate-500 md:text-right">
                          <p>{quiz.learning_outcomes?.code || "Chưa gắn LO"}</p>
                          <p className="mt-1">Bloom: {bloomLabel(quiz.bloom_level ?? quiz.learning_outcomes?.bloom_level)}</p>
                          <p className="mt-1">{quiz.source_chunk_ids?.length || 0} nguồn tham chiếu</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-start gap-2">
                        {quiz.status === "APPROVED" ? (
                          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                            ✓ Đã approve
                          </span>
                        ) : (
                          <>
                            <form method="post" action={withSid(`/api/review/quiz-items/${quiz.quiz_id}/approve`, sid)}>
                              <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Approve</button>
                            </form>
                            <details className="group rounded-lg border border-slate-300 bg-white">
                              <summary className="cursor-pointer list-none px-4 py-2 text-sm font-medium text-slate-700">Yêu cầu chỉnh sửa</summary>
                              <form
                                method="post"
                                action={withSid(`/api/review/quiz-items/${quiz.quiz_id}/reject`, sid)}
                                className="flex min-w-72 gap-2 border-t border-slate-200 p-3"
                              >
                                <input
                                  name="reason"
                                  required
                                  placeholder="Nêu lý do để lưu audit…"
                                  className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
                                />
                                <button className="rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700">Gửi</button>
                              </form>
                            </details>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}

                {cards.length > 0 && (
                  <details className="group bg-slate-50/60">
                    <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-slate-700">
                      Cards cùng lesson ({cards.length}) <span className="ml-1 text-slate-400 group-open:hidden">▾</span>
                    </summary>
                    <div className="divide-y divide-slate-200 border-t border-slate-200 bg-white">
                      {cards.map((card) => {
                        const meta = statusMeta(card.status);
                        return (
                          <div key={card.card_id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-medium">{card.title || "Untitled card"}</h4>
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
                              </div>
                              {insight(card.content) && <p className="mt-1 text-sm text-slate-600">{insight(card.content)}</p>}
                            </div>
                            {card.status !== "APPROVED" && (
                              <div className="flex items-start gap-2">
                                <form method="post" action={withSid(`/api/review/cards/${card.card_id}/approve`, sid)}>
                                  <button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white">Approve</button>
                                </form>
                                <form method="post" action={withSid(`/api/review/cards/${card.card_id}/reject`, sid)}>
                                  <input type="hidden" name="reason" value="Needs changes" />
                                  <button className="rounded-lg border px-3 py-2 text-sm">Reject</button>
                                </form>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            </section>
          );
        })}

        {!error && lessonIds.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-medium text-slate-800">Review inbox đang trống</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Khi pipeline hoặc AI quiz studio tạo nội dung mới, các câu hỏi sẽ xuất hiện ở đây cùng đáp án và giải thích để bạn kiểm tra.
            </p>
            <a
              className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              href={withSid("/manage/documents", sid)}
            >
              Kiểm tra tài liệu
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
