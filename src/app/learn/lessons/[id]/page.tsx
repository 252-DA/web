import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";

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

function cardBullets(content: unknown): string[] {
  if (!content || typeof content !== "object") {
    return [];
  }
  const value = (content as { bullets?: unknown }).bullets;
  return Array.isArray(value) ? value.map(String) : [];
}

function cardInsight(content: unknown) {
  if (!content || typeof content !== "object") {
    return "";
  }
  return String((content as { key_insight?: unknown; keyInsight?: unknown }).key_insight || (content as { keyInsight?: unknown }).keyInsight || "");
}

export default async function LessonPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);
  const [lesson, cards] = await Promise.all([
    coreApi.getLesson(id, claims),
    coreApi.lessonCards(id, claims, "PUBLISHED"),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-start justify-between gap-4 px-4 py-5">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              {lesson.learning_outcomes?.chapters?.title || "Lesson"}
            </p>
            <h1 className="text-2xl font-semibold">{lesson.title}</h1>
            {lesson.learning_outcomes && (
              <p className="mt-2 text-sm text-slate-600">
                {lesson.learning_outcomes.code ? `${lesson.learning_outcomes.code}: ` : ""}
                {lesson.learning_outcomes.statement_vi}
              </p>
            )}
          </div>
          <a
            href={withSid(`/learn/lessons/${lesson.lesson_id}/quiz`, sid)}
            className="shrink-0 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Làm quiz
          </a>
        </div>
      </header>
      <section className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {cards.map((card, index) => (
          <article key={card.card_id} className="rounded border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
              <h2 className="font-semibold">{card.title || `Card ${index + 1}`}</h2>
            </div>
            {cardInsight(card.content) && (
              <p className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{cardInsight(card.content)}</p>
            )}
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
              {cardBullets(card.content).map((bullet, bulletIndex) => (
                <li key={bulletIndex}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
        {cards.length === 0 && (
          <p className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Lesson này chưa có card published.
          </p>
        )}
      </section>
    </main>
  );
}
