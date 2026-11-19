import { readManageSession } from "@/lib/session";
import { InstructorNav } from "@/components/instructor-nav";
import { MediaLibraryClient } from "./media-library-client";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ManageMediaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền quản lý khóa học này.</main>;
  }

  const { sid, session } = access.active;
  const isAdmin = access.active.session.roles?.includes("admin");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Digital Asset Management (DAM)
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Kho học liệu Video</h1>
              <p className="mt-1 text-sm text-slate-600">
                {session.displayName || session.lmsSub} · {session.courseId}
              </p>
            </div>
          </div>
          <InstructorNav active="media" courseId={session.courseId || ""} sid={sid || ""} isAdmin={isAdmin} />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <MediaLibraryClient
          sid={sid || ""}
          courseId={session.courseId || ""}
          userSub={session.lmsSub}
          userDisplayName={session.displayName || undefined}
        />
      </div>
    </main>
  );
}
