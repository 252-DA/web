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

function Disabled() {
  return (
    <div className="p-4">
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Trợ giảng AI chưa được bật cho khóa học này.
      </p>
    </div>
  );
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
      <main className="h-dvh bg-white text-slate-950">
        {session.chatbotEnabled ? <ChatPanel sid={sid} canDebug={isStaff} embedded /> : <Disabled />}
      </main>
    );
  }

  let course: Course | null = null;
  try {
    course = await coreApi.getCourse<Course>(id, claimsFromSession(session));
  } catch {
    course = null;
  }

  // Trang đầy đủ: thanh tiêu đề gọn ở trên, phần còn lại là khung chat ba cột
  // (lịch sử · hội thoại · nguồn) chiếm hết chiều cao màn hình.
  return (
    <main className="flex h-dvh flex-col bg-slate-50 text-slate-950">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <a href={withSid(`/learn/courses/${id}`, sid)} className="text-sm text-slate-500 hover:text-slate-800">
            ← {course?.code ?? "Khóa học"}
          </a>
          <h1 className="text-base font-semibold">Trợ giảng AI{course ? ` · ${course.name}` : ""}</h1>
        </div>
        {isStaff && (
          <InstructorNav active="chat" courseId={session.courseId} sid={sid} isAdmin={session.role === "administrator"} />
        )}
      </header>
      <div className="min-h-0 flex-1">
        {session.chatbotEnabled ? (
          <ChatPanel sid={sid} canDebug={isStaff} courseName={course?.name} />
        ) : (
          <Disabled />
        )}
      </div>
    </main>
  );
}
