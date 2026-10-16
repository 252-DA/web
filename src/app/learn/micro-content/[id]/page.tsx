import { notFound } from "next/navigation";
import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { LearnMicroContentClient } from "./learn-micro-content-client";

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

  let microContent: any = null;
  try {
    microContent = await coreApi.getMicroContent(id, claims);
  } catch (error) {
    notFound();
  }

  const isStaff = session.courseRole === "instructor" || session.courseRole === "ta";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-slate-500">Micro Content</p>
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
          sid={sid}
          isStaff={isStaff}
        />
      </section>
    </main>
  );
}
