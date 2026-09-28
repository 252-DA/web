import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { answerKey, quizChoices } from "@/lib/quiz";

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
  type: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
};

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

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
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền quản lý khóa học này.</main>;
  }

  const { sid, session } = access.active;
  const claims = claimsFromSession(session);
  const [lesson, cards, quizzes] = await Promise.all([
    coreApi.getLesson<Lesson>(id, claims),
    coreApi.lessonCards<Card[]>(id, claims, ""),
    coreApi.lessonQuiz<Quiz[]>(id, claims, ""),
  ]);
  const hasApprovedContent = [...cards, ...quizzes].some(
    (item) => item.status === "APPROVED",
  );

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
              <button
                disabled={!hasApprovedContent}
                title={hasApprovedContent ? undefined : "Cần duyệt ít nhất một nội dung trước khi publish"}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Publish approved
              </button>
            </form>
          </div>
          <InstructorNav active="review" courseId={session.courseId} sid={sid} />
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        {first(sp.reviewError) && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{first(sp.reviewError)}</p>
        )}
        {first(sp.reviewSuccess) && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{first(sp.reviewSuccess)}</p>
        )}
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
              <form
                key={quiz.quiz_id}
                method="post"
                action={withSid(`/api/review/quiz-items/${quiz.quiz_id}/update`, sid)}
                className="grid gap-4 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{quiz.type}</p>
                    <p className="mt-1 text-xs text-slate-500">Chọn radio bên cạnh phương án đúng.</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold">{quiz.status}</span>
                </div>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Câu hỏi</span>
                  <textarea
                    name="question"
                    required
                    defaultValue={quiz.question}
                    className="min-h-24 rounded-lg border border-slate-300 p-3 leading-6 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">Các lựa chọn</legend>
                  {Array.from({ length: 4 }, (_, index) => {
                    const choices = quizChoices(quiz.options);
                    const choice = choices[index];
                    const checked = choice ? answerKey(choice.value) === answerKey(quiz.correct_answer) : false;
                    return (
                      <label key={index} className="grid grid-cols-[auto_auto_1fr] items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                        <input
                          type="radio"
                          name="correct_index"
                          value={index}
                          required
                          defaultChecked={checked}
                          aria-label={`Đặt lựa chọn ${index + 1} làm đáp án đúng`}
                        />
                        <span className="font-semibold text-slate-400">{String.fromCharCode(65 + index)}</span>
                        <input
                          name={`option_${index}`}
                          required
                          defaultValue={choice?.label || ""}
                          className="h-10 min-w-0 rounded-lg border border-slate-300 px-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        />
                      </label>
                    );
                  })}
                </fieldset>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Giải thích đáp án</span>
                  <textarea
                    name="explanation"
                    defaultValue={quiz.explanation || ""}
                    className="min-h-24 rounded-lg border border-slate-300 p-3 leading-6 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
                <button className="w-fit rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  Lưu thay đổi
                </button>
              </form>
            ))}
            {quizzes.length === 0 && <p className="p-5 text-sm text-slate-500">Lesson này chưa có quiz item.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
