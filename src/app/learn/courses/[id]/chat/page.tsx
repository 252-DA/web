import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { ChatPanel } from "./chat-panel";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Course = { course_id: string; code: string; name: string };

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function CourseChatPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  const { sid, session } = active;
  const isStaff = session.courseRole === "instructor" || session.courseRole === "ta" || session.role === "administrator";

  // Mở từ nút chat ở thanh trên của Canvas: ngăn bên đã có tiêu đề và nút đóng,
  // nên chỉ vẽ khung chat, chiếm hết chiều cao ngăn.
  if (sp.embed === "1") {
    return (
      <main className="h-screen bg-slate-50 p-3 text-slate-950">
        {session.chatbotEnabled ? (
          <ChatPanel sid={sid} showTrace={isStaff} embedded />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Chatbot chưa được bật cho khóa học này.
          </p>
        )}
      </main>
    );
  }

  let course: Course | null = null;
  try {
    course = await coreApi.getCourse<Course>(id, claimsFromSession(session));
  } catch {
    course = null;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">{course?.code ?? "Khóa học"}</p>
          <h1 className="text-xl font-semibold">Hỏi đáp về tài liệu{course ? `: ${course.name}` : ""}</h1>
          <p className="mt-1 text-sm">
            <a href={withSid(`/learn/courses/${id}`, sid)} className="text-slate-600 underline">
              ← Về trang khóa học
            </a>
          </p>
          {isStaff && (
            <InstructorNav active="chat" courseId={session.courseId} sid={sid} isAdmin={session.role === "administrator"} />
          )}
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-6">
        {session.chatbotEnabled ? (
          <ChatPanel sid={sid} showTrace={isStaff} />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Chatbot chưa được bật cho khóa học này.
          </p>
        )}
      </section>
    </main>
  );
}
