import { notFound } from "next/navigation";
import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { EditTabsClient, type EditableMicroContent } from "./edit-tabs-client";

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

export default async function EditMicroContentPage({ params, searchParams }: Props) {
  const { id } = await params;
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

  let microContent: EditableMicroContent | null = null;
  try {
    microContent = await coreApi.getMicroContent<EditableMicroContent>(id, claims);
  } catch {
    notFound();
  }

  const currentTab = typeof sp.tab === "string" ? sp.tab : "questions";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <a
                  href={withSid("/manage/micro-content", sid)}
                  className="text-xs font-semibold uppercase text-slate-500 hover:text-slate-800"
                >
                  ← Danh sách Micro Content
                </a>
              </div>
              <h1 className="mt-1 text-2xl font-semibold">{microContent.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>
                  {session.displayName || session.lmsSub} · {session.courseId}
                </span>
                {microContent.loCode && (
                  <span className="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-semibold text-sky-800">
                    {microContent.loCode}
                  </span>
                )}
                {microContent.sourceDocumentId && (
                  <a
                    href={`${withSid(
                      `/api/documents/${microContent.sourceDocumentId}/file`,
                      sid,
                    )}#page=${microContent.sourcePageFrom || 1}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                  >
                    {microContent.sourceDocumentTitle || "Slide nguồn"} · Trang{" "}
                    {microContent.sourcePageFrom || 1}–{microContent.sourcePageTo || microContent.sourcePageFrom || 1}{" "}
                    ↗
                  </a>
                )}
              </div>
            </div>
            <div>
              {microContent.status === "PUBLISHED" ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  ● Đã xuất bản
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  ○ Bản nháp
                </span>
              )}
            </div>
          </div>
          <InstructorNav
            active="micro-content"
            courseId={session.courseId || ""}
            sid={sid || ""}
            isAdmin={session.role === "administrator"}
          />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <EditTabsClient
          microContent={microContent}
          sid={sid ?? ""}
          defaultTab={currentTab}
        />
      </section>
    </main>
  );
}

