import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Lesson = { lesson_id: string; title: string; status: string };
type Card = { card_id: string; title: string | null; status: string; content: unknown };
type Quiz = {
  quiz_id: string;
  question: string;
  status: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function json(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export default async function LessonEditPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);
  const [lesson, cards, quizzes] = await Promise.all([
    coreApi.getLesson<Lesson>(id, claims),
    coreApi.lessonCards<Card[]>(id, claims, ""),
    coreApi.lessonQuiz<Quiz[]>(id, claims, ""),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Edit lesson</p>
              <h1 className="text-2xl font-semibold">{lesson.title}</h1>
            </div>
            <form method="post" action={withSid(`/api/lessons/${id}/publish`, sid)}>
              <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Publish approved</button>
            </form>
          </div>
          <InstructorNav active="review" courseId={session.courseId} sid={sid} />
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4 font-semibold">Cards</div>
          <div className="divide-y divide-slate-200">
            {cards.map((card) => (
              <form key={card.card_id} method="post" action={withSid(`/api/review/cards/${card.card_id}/update`, sid)} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">{card.title || "Untitled card"}</h2>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{card.status}</span>
                </div>
                <textarea name="content" defaultValue={json(card.content)} className="min-h-36 w-full rounded border border-slate-300 p-3 font-mono text-xs" />
                <button className="rounded border px-3 py-2 text-sm">Save card</button>
              </form>
            ))}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4 font-semibold">Quiz items</div>
          <div className="divide-y divide-slate-200">
            {quizzes.map((quiz) => (
              <form key={quiz.quiz_id} method="post" action={withSid(`/api/review/quiz-items/${quiz.quiz_id}/update`, sid)} className="grid gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <input name="question" defaultValue={quiz.question} className="h-10 flex-1 rounded border border-slate-300 px-3 text-sm" />
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{quiz.status}</span>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Options JSON</span>
                  <textarea name="options" defaultValue={json(quiz.options)} className="min-h-28 rounded border border-slate-300 p-3 font-mono text-xs" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Correct answer JSON</span>
                  <textarea name="correct_answer" defaultValue={json(quiz.correct_answer)} className="min-h-20 rounded border border-slate-300 p-3 font-mono text-xs" />
                </label>
                <input name="explanation" defaultValue={quiz.explanation || ""} className="h-10 rounded border border-slate-300 px-3 text-sm" />
                <button className="w-fit rounded border px-3 py-2 text-sm">Save quiz</button>
              </form>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
