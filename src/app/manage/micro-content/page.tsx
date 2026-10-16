import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type MicroContentItem = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  videoSource: string;
  videoStatus: string;
  videoDurationMs: number | null;
  videoError: string | null;
  passingScore: number;
  requiredWatchPercent: number;
  status: string;
  questionCount: number;
  attemptCount: number;
  createdAt: string;
};

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

  const items = await coreApi
    .listMicroContents<MicroContentItem[]>(session.courseId, claims)
    .catch(() => []);

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
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <h3 className="text-lg font-medium text-slate-800">Chưa có bài Micro Content nào</h3>
            <p className="mt-1 text-sm text-slate-500">
              Tạo bài đầu tiên kết hợp video ngắn cùng các câu hỏi củng cố kiến thức.
            </p>
            <a
              href={withSid("/manage/micro-content/new", sid)}
              className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Tạo Micro Content
            </a>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4">Tiêu đề</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Video</th>
                  <th className="px-6 py-4">Câu hỏi</th>
                  <th className="px-6 py-4">Yêu cầu</th>
                  <th className="px-6 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <a
                        href={withSid(`/manage/micro-content/${item.id}/edit`, sid)}
                        className="font-medium text-slate-900 hover:text-sky-600"
                      >
                        {item.title}
                      </a>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.status === "PUBLISHED" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                          Đã xuất bản
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Bản nháp
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            item.videoStatus === "READY"
                              ? "bg-emerald-500"
                              : item.videoStatus === "PROCESSING" || item.videoStatus === "UPLOADING"
                              ? "bg-amber-500 animate-pulse"
                              : item.videoStatus === "FAILED"
                              ? "bg-rose-500"
                              : "bg-slate-300"
                          }`}
                        />
                        <span className="text-xs">
                          {item.videoStatus === "READY"
                            ? `Sẵn sàng (${formatDuration(item.videoDurationMs)})`
                            : item.videoStatus === "PROCESSING"
                            ? "Đang xử lý..."
                            : item.videoStatus === "UPLOADING"
                            ? "Đang tải lên..."
                            : item.videoStatus === "FAILED"
                            ? "Lỗi tải video"
                            : "Chưa có video"}
                        </span>
                      </div>
                      {item.videoError && (
                        <p className="mt-1 text-xs text-rose-600 max-w-xs">{item.videoError}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {item.questionCount > 0 ? (
                        <span>{item.questionCount} câu hỏi</span>
                      ) : (
                        <span className="text-amber-600">Chưa có câu hỏi</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      Điểm: {item.passingScore}% · Xem: {item.requiredWatchPercent}%
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={withSid(`/manage/micro-content/${item.id}/edit`, sid)}
                        className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      >
                        Chỉnh sửa
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
