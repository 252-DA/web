import { readManageSession } from "@/lib/session";
import { InstructorNav } from "@/components/instructor-nav";
import { CreateMicroContentForm } from "./form";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewMicroContentPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền quản lý khóa học này.</main>;
  }

  const { sid, session } = access.active;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Instructor workspace</p>
          <h1 className="text-2xl font-semibold">Tạo Micro Content mới</h1>
          <p className="mt-1 text-sm text-slate-600">
            {session.displayName || session.lmsSub} · {session.courseId}
          </p>
          <InstructorNav
            active="micro-content"
            courseId={session.courseId}
            sid={sid}
            isAdmin={session.role === "administrator"}
          />
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-6">
        <CreateMicroContentForm sid={sid} />
      </section>
    </main>
  );
}

