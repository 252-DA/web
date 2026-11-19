import { InstructorNav } from "@/components/instructor-nav";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import type {
  BankQuizItem,
  BankShareCandidates,
  QuestionBankDetail,
  QuestionBankSummary,
} from "@/lib/question-bank";
import { readManageSession } from "@/lib/session";
import { BankDetailClient } from "./bank-detail-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type RawLo = {
  lo_id: string;
  code: string;
  statement_vi: string;
};

type BankItemsPayload = {
  bank: QuestionBankDetail;
  items: BankQuizItem[];
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

export default async function BankDetailPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const access = await readManageSession(first(sp.sid));
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền truy cập ngân hàng câu hỏi.</main>;
  }

  const { sid, session } = access.active;
  const claims = claimsFromSession(session);
  let detail: BankItemsPayload | null = null;
  let allBanks: QuestionBankSummary[] = [];
  let courseLos: RawLo[] = [];
  let shareCandidates: BankShareCandidates | null = null;
  let error = "";

  try {
    const [itemsData, banksData] = await Promise.all([
      coreApi.listQuestionBankItems<BankItemsPayload>({ bankId: id }, claims),
      coreApi.listQuestionBanks<QuestionBankSummary[]>({ courseId: session.courseId }, claims),
    ]);
    detail = itemsData;
    allBanks = banksData ?? [];
    const [losData, candidatesData] = await Promise.all([
      coreApi.listLearningOutcomes<RawLo[]>(itemsData.bank.home_course_id, claims).catch(() => []),
      itemsData.bank.role === "EDIT"
        ? coreApi.listQuestionBankShareCandidates<BankShareCandidates>(id, claims).catch(() => null)
        : Promise.resolve(null),
    ]);
    courseLos = losData ?? [];
    shareCandidates = candidatesData;
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được ngân hàng câu hỏi.";
  }

  const forkTargets = allBanks
    .filter((b) => b.bank_id !== id && b.role === "EDIT")
    .map((b) => ({
      bank_id: b.bank_id,
      title: b.title,
      course_name: b.home_course.name,
      is_current_course: b.is_current_course,
    }));

  const loMap = new Map<string, { lo_id: string; code: string; statement_vi: string }>();
  for (const lo of courseLos) {
    loMap.set(lo.lo_id, { lo_id: lo.lo_id, code: lo.code, statement_vi: lo.statement_vi });
  }
  for (const item of detail?.items ?? []) {
    if (item.learning_outcomes && !loMap.has(item.learning_outcomes.lo_id)) {
      loMap.set(item.learning_outcomes.lo_id, item.learning_outcomes);
    }
  }
  const loOptions = [...loMap.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <a href={withSid("/manage/banks", sid)} className="font-medium text-sky-700 hover:underline">
              ← Ngân hàng câu hỏi
            </a>
            {detail?.bank.home_course_name && <span>· {detail.bank.home_course_name}</span>}
            {detail?.bank.subject_code && <span>· {detail.bank.subject_code}</span>}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{detail?.bank.title ?? "Chi tiết ngân hàng câu hỏi"}</h1>
          {detail?.bank.description && <p className="mt-1 text-sm text-slate-600">{detail.bank.description}</p>}
          <InstructorNav
            active="banks"
            courseId={session.courseId}
            sid={sid}
            isAdmin={session.role === "administrator"}
          />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        {error || !detail ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error || "Không tìm thấy ngân hàng câu hỏi."}
          </p>
        ) : (
          <BankDetailClient
            sid={sid}
            initialBank={detail.bank}
            initialItems={detail.items}
            loOptions={loOptions}
            forkTargets={forkTargets}
            initialCandidates={shareCandidates}
          />
        )}
      </section>
    </main>
  );
}
