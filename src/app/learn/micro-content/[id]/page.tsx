import { notFound } from "next/navigation";
import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { LearnMicroContentClient, type LearnMicroContentData } from "./learn-micro-content-client";
import type { AttemptResult } from "./questions";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LearnMicroContentPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const claims = claimsFromSession(session);

  let microContent: LearnMicroContentData | null = null;
  try {
    microContent = await coreApi.getMicroContent<LearnMicroContentData>(id, claims);
  } catch {
    notFound();
  }

  const isStaff = session.courseRole === "instructor" || session.courseRole === "ta";

  // Khôi phục kết quả lần làm gần nhất (nếu có) để tải lại trang vẫn thấy trạng thái
  // chấm câu tự luận ngắn và feedback từ AI.
  let initialResult: AttemptResult | null = null;
  try {
    const listed = await coreApi.listMicroContentAttempts<{
      attempts?: Array<{ attempt_id: string; user_id: string }>;
    }>(id, claims);
    const rows = Array.isArray(listed?.attempts) ? listed.attempts : [];
    const mine = rows.find((row) => row.user_id === claims.sub) ?? (isStaff ? null : rows[0]);
    if (mine?.attempt_id) {
      initialResult = await coreApi.getMicroContentResult<AttemptResult>(mine.attempt_id, claims);
    }
  } catch {
    initialResult = null;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Micro Content</p>
              {microContent.loCode && (
                <span className="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-semibold text-sky-800">
                  {microContent.loCode}
                </span>
              )}
              {microContent.sourceDocumentTitle && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {microContent.sourceDocumentTitle}
                  {microContent.sourcePageFrom
                    ? ` · Trang ${microContent.sourcePageFrom}${
                        microContent.sourcePageTo &&
                        microContent.sourcePageTo !== microContent.sourcePageFrom
                          ? `–${microContent.sourcePageTo}`
                          : ""
                      }`
                    : ""}
                </span>
              )}
            </div>
            {isStaff && (
              <span className="rounded bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Chế độ xem trước (Instructor Preview)
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{microContent.title}</h1>
          {microContent.description && (
            <p className="mt-1 text-sm text-slate-600">{microContent.description}</p>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-6">
        <LearnMicroContentClient
          microContent={microContent}
          initialResult={initialResult}
          sid={sid || ""}
          isStaff={isStaff}
        />
      </section>
    </main>
  );
}
