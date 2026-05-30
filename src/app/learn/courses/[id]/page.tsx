import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Course = { course_id: string; code: string; name: string; description: string | null };
type Lesson = {
  lesson_id: string;
  title: string;
  status: string;
  learning_outcomes?: { code: string | null; statement: string };
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function CoursePage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);
  const [course, lessons] = await Promise.all([
    coreApi.getCourse<Course>(id, claims),
    coreApi.listLessons<Lesson[]>({ courseId: id, status: "PUBLISHED" }, claims),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">{course.code}</p>
          <h1 className="text-2xl font-semibold">{course.name}</h1>
          {course.description && <p className="mt-2 text-sm text-slate-600">{course.description}</p>}
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-4 py-6">
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold">Lessons đã publish</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {lessons.map((lesson, index) => (
              <a
                key={lesson.lesson_id}
                href={withSid(`/learn/lessons/${lesson.lesson_id}`, sid)}
                className="grid gap-3 px-4 py-4 hover:bg-slate-50 md:grid-cols-[3rem_1fr_auto]"
              >
                <span className="text-sm font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block font-medium">{lesson.title}</span>
                  {lesson.learning_outcomes && (
                    <span className="mt-1 block text-sm text-slate-600">
                      {lesson.learning_outcomes.code ? `${lesson.learning_outcomes.code}: ` : ""}
                      {lesson.learning_outcomes.statement}
                    </span>
                  )}
                </span>
                <span className="self-center rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  {lesson.status}
                </span>
              </a>
            ))}
            {lessons.length === 0 && (
              <p className="p-6 text-sm text-slate-500">Chưa có lesson published trong khóa này.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
