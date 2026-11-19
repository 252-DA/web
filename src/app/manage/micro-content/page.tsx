import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import {
  ManageMicroContentClient,
  type LeafLoOption,
  type LectureDocumentOption,
  type ManageMicroContentItem,
  type OutlineRequestItem,
} from "./manage-micro-content-client";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type RawLearningOutcome = {
  lo_id: string;
  code: string;
  parent_code?: string | null;
  statement_vi: string;
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function ManageMicroContentPage({ searchParams }: Props) {
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

  const [items, docs, rawLos, outlineRequests] = await Promise.all([
    coreApi.listMicroContents<ManageMicroContentItem[]>(session.courseId, claims).catch(() => []),
    coreApi
      .listDocuments<LectureDocumentOption[]>({ courseId: session.courseId, limit: 100 }, claims)
      .catch(() => []),
    coreApi.listLearningOutcomes<RawLearningOutcome[]>(session.courseId, claims).catch(() => []),
    coreApi
      .listContentGenerationRequests<OutlineRequestItem[]>(
        { courseId: session.courseId, type: "micro_outline", limit: 10 },
        claims,
      )
      .catch(() => []),
  ]);

  const lectureDocs = docs.filter((d) => d.role === "lecture" && d.chunks_count > 0);
  const parentCodes = new Set(
    rawLos.map((lo) => lo.parent_code).filter((c): c is string => Boolean(c)),
  );
  const leafLos: LeafLoOption[] = rawLos
    .filter((lo) => !parentCodes.has(lo.code))
    .map((lo) => ({ lo_id: lo.lo_id, code: lo.code, statement_vi: lo.statement_vi }));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Instructor workspace</p>
              <h1 className="text-2xl font-semibold">Micro Content</h1>
              <p className="mt-1 text-sm text-slate-600">
                {session.displayName || session.lmsSub} · {session.courseId}
              </p>
            </div>
            <a
              href={withSid("/manage/micro-content/new", sid)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              + Tạo Micro Content mới
            </a>
          </div>
          <InstructorNav
            active="micro-content"
            courseId={session.courseId}
            sid={sid}
            isAdmin={session.role === "administrator"}
          />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <ManageMicroContentClient
          sid={sid ?? ""}
          items={items}
          lectureDocs={lectureDocs}
          leafLos={leafLos}
          initialOutlineRequests={outlineRequests}
        />
      </section>
    </main>
  );
}
