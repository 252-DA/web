import { InstructorNav } from "@/components/instructor-nav";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import type { QuestionBankSummary } from "@/lib/question-bank";
import { readManageSession } from "@/lib/session";
import { BanksListClient } from "./banks-list-client";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type CourseInfo = {
  course_id: string;
  code: string;
  subject_code: string | null;
  name: string;
};

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BanksPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(first(sp.sid));
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền truy cập ngân hàng câu hỏi.</main>;
  }

  const { sid, session } = access.active;
  const claims = claimsFromSession(session);
  let banks: QuestionBankSummary[] = [];
  let course: CourseInfo | null = null;
  let error = "";
  try {
    const [bankRows, courseRow] = await Promise.all([
      coreApi.listQuestionBanks<QuestionBankSummary[]>({ courseId: session.courseId }, claims),
      coreApi.getCourse<CourseInfo>(session.courseId, claims).catch(() => null),
    ]);
    banks = bankRows ?? [];
    course = courseRow;
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được danh sách ngân hàng câu hỏi.";
  }

  const displayCode = course?.subject_code ?? course?.code ?? "";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {displayCode ? `${displayCode} · Instructor workspace` : "Instructor workspace"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Ngân hàng câu hỏi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Quản lý kho câu hỏi riêng, ngân hàng dùng chung của khoá và các ngân hàng được chia sẻ theo môn học.
          </p>
          <InstructorNav
            active="banks"
            courseId={session.courseId}
            sid={sid}
            isAdmin={session.role === "administrator"}
          />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : (
          <BanksListClient
            sid={sid}
            courseId={session.courseId}
            courseSubjectCode={course?.subject_code ?? null}
            initialBanks={banks}
          />
        )}
      </section>
    </main>
  );
}
