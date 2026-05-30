import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type LessonRef = { lesson_id: string; title: string };
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
  lessons?: LessonRef;
};
type Drafts = { cards: CardDraft[]; quizItems: QuizDraft[] };

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

export default async function ReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);
  let drafts: Drafts = { cards: [], quizItems: [] };
  let error = "";
  try {
    drafts = await coreApi.listReviewDrafts<Drafts>({ courseId: session.courseId }, claims);
  } catch (err) {
    error = err instanceof Error ? err.message : "Không thể tải review inbox.";
  }

  const lessonIds = Array.from(
    new Set([
      ...drafts.cards.map((card) => card.lessons?.lesson_id).filter(Boolean),
      ...drafts.quizItems.map((quiz) => quiz.lessons?.lesson_id).filter(Boolean),
    ]),
  ) as string[];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Instructor</p>
            <h1 className="text-xl font-semibold">Review content</h1>
          </div>
          <nav className="flex gap-2 text-sm">
            <a className="rounded border px-3 py-2" href={withSid("/manage/dashboard", sid)}>Dashboard</a>
            <a className="rounded border px-3 py-2" href={withSid("/manage/documents", sid)}>Documents</a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {lessonIds.map((lessonId) => {
          const cards = drafts.cards.filter((card) => card.lessons?.lesson_id === lessonId);
          const quizzes = drafts.quizItems.filter((quiz) => quiz.lessons?.lesson_id === lessonId);
          const title = cards[0]?.lessons?.title || quizzes[0]?.lessons?.title || "Lesson";
          return (
            <section key={lessonId} className="overflow-hidden rounded border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <div>
                  <h2 className="font-semibold">{title}</h2>
                  <p className="text-sm text-slate-500">{cards.length} cards, {quizzes.length} quiz items</p>
                </div>
                <div className="flex gap-2">
                  <a className="rounded border px-3 py-2 text-sm" href={withSid(`/manage/lessons/${lessonId}/edit`, sid)}>
                    Edit
                  </a>
                  <form method="post" action={withSid(`/api/lessons/${lessonId}/publish`, sid)}>
                    <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">Publish</button>
                  </form>
                </div>
              </div>
              <div className="divide-y divide-slate-200">
                {cards.map((card) => (
                  <div key={card.card_id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">Card · {card.status}</p>
                      <h3 className="font-medium">{card.title || "Untitled card"}</h3>
                      {insight(card.content) && <p className="mt-1 text-sm text-slate-600">{insight(card.content)}</p>}
                    </div>
                    <div className="flex items-start gap-2">
                      <form method="post" action={withSid(`/api/review/cards/${card.card_id}/approve`, sid)}>
                        <button className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white">Approve</button>
                      </form>
                      <form method="post" action={withSid(`/api/review/cards/${card.card_id}/reject`, sid)}>
                        <input type="hidden" name="reason" value="Needs changes" />
                        <button className="rounded border px-3 py-2 text-sm">Reject</button>
                      </form>
                    </div>
                  </div>
                ))}
                {quizzes.map((quiz) => (
                  <div key={quiz.quiz_id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">Quiz · {quiz.type} · {quiz.status}</p>
                      <h3 className="font-medium">{quiz.question}</h3>
                    </div>
                    <div className="flex items-start gap-2">
                      <form method="post" action={withSid(`/api/review/quiz-items/${quiz.quiz_id}/approve`, sid)}>
                        <button className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white">Approve</button>
                      </form>
                      <form method="post" action={withSid(`/api/review/quiz-items/${quiz.quiz_id}/reject`, sid)}>
                        <input type="hidden" name="reason" value="Needs changes" />
                        <button className="rounded border px-3 py-2 text-sm">Reject</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {!error && lessonIds.length === 0 && (
          <p className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Không có draft nào đang chờ review.
          </p>
        )}
      </section>
    </main>
  );
}
