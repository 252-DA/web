import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { QuizForm } from "./quiz-form";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function LessonQuizPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);
  const [lesson, quizItems] = await Promise.all([
    coreApi.getLesson(id, claims),
    coreApi.lessonQuiz(id, claims, "PUBLISHED"),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Quiz</p>
            <h1 className="text-2xl font-semibold">{lesson.title}</h1>
          </div>
          <a className="rounded border px-3 py-2 text-sm" href={withSid(`/learn/lessons/${id}`, sid)}>
            Quay lại lesson
          </a>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-4 py-6">
        {quizItems.length > 0 ? (
          <QuizForm
            lessonId={id}
            quizItems={quizItems}
            resourceLinkId={session.resourceLinkId}
            sid={sid}
          />
        ) : (
          <p className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Lesson này chưa có quiz published.
          </p>
        )}
      </section>
    </main>
  );
}
