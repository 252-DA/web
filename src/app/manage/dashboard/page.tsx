import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Lesson = { lesson_id: string; title: string; status: string; published_at: string | null };
type Drafts = { cards: unknown[]; quizItems: unknown[] };

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function ManageDashboard({ searchParams }: Props) {
  const sp = await searchParams;
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);
  const [lessons, drafts] = await Promise.all([
    coreApi.listLessons<Lesson[]>({ courseId: session.courseId }, claims).catch(() => []),
    coreApi.listReviewDrafts<Drafts>({ courseId: session.courseId }, claims).catch(() => ({ cards: [], quizItems: [] })),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Instructor workspace</p>
          <h1 className="text-2xl font-semibold">Quản lý khóa học</h1>
          <p className="mt-1 text-sm text-slate-600">{session.displayName || session.lmsSub}</p>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-3">
        <a className="rounded border border-slate-200 bg-white p-4" href={withSid("/manage/documents", sid)}>
          <p className="text-sm text-slate-500">Pipeline</p>
          <p className="mt-2 text-2xl font-semibold">Tài liệu</p>
        </a>
        <a className="rounded border border-slate-200 bg-white p-4" href={withSid("/manage/review", sid)}>
          <p className="text-sm text-slate-500">Draft cần duyệt</p>
          <p className="mt-2 text-2xl font-semibold">{drafts.cards.length + drafts.quizItems.length}</p>
        </a>
        <a className="rounded border border-slate-200 bg-white p-4" href={withSid(`/learn/courses/${session.courseId}`, sid)}>
          <p className="text-sm text-slate-500">Learner preview</p>
          <p className="mt-2 text-2xl font-semibold">Xem khóa học</p>
        </a>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-8">
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold">Lessons</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {lessons.map((lesson) => (
              <a
                key={lesson.lesson_id}
                href={withSid(`/manage/lessons/${lesson.lesson_id}/edit`, sid)}
                className="grid gap-2 px-4 py-3 text-sm hover:bg-slate-50 md:grid-cols-[1fr_auto_auto]"
              >
                <span className="font-medium">{lesson.title}</span>
                <span className="text-slate-600">{lesson.status}</span>
                <span className="text-slate-500">{lesson.published_at ? "Published" : "Draft"}</span>
              </a>
            ))}
            {lessons.length === 0 && <p className="p-6 text-sm text-slate-500">Chưa có lesson.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
