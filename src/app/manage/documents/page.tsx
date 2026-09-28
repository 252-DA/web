import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { UploadForm } from "./components/upload-form";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type DocumentRole = "lecture" | "reference" | "exercise";

type DocumentSummary = {
  document_id: string;
  title: string;
  mime_type: string | null;
  status: string;
  created_at: string;
  chunks_count: number;
  source: "upload" | "canvas";
  lms_module: string | null;
  lms_published: boolean | null;
  role: DocumentRole;
  role_provenance: "inferred" | "confirmed";
  chapter_code: string | null;
  chapter_provenance: "module" | "file_name" | "content" | "confirmed" | null;
  chapter_confidence: number | null;
  chapter_reason: string | null;
};

type Chapter = { code: string; title: string };

const ROLE_LABEL: Record<DocumentRole, string> = {
  lecture: "Bài giảng",
  reference: "Tham khảo",
  exercise: "Bài tập",
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

/** Chương hiện tại và lý do — để giảng viên biết có cần sửa hay không. */
function placementNote(doc: DocumentSummary, chapters: Chapter[]) {
  if (doc.role === "reference") {
    return "Gắn chuẩn đầu ra theo từng phần của tài liệu.";
  }
  if (!doc.chapter_code) {
    return doc.chunks_count > 0
      ? "Chưa xác định được chương — hãy chọn chương."
      : "Sẽ xác định chương sau khi xử lý xong.";
  }
  const title = chapters.find((c) => c.code === doc.chapter_code)?.title;
  const chapter = `Chương ${doc.chapter_code}${title ? ` · ${title}` : ""}`;
  if (doc.chapter_provenance === "confirmed") return `${chapter} (giảng viên chọn)`;
  const confidence = doc.chapter_confidence ? ` · ${Math.round(doc.chapter_confidence * 100)}%` : "";
  return `${chapter} — ${doc.chapter_reason ?? "hệ thống xác định"}${confidence}`;
}

export default async function DocumentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền quản lý khóa học này.</main>;
  }

  const { sid, session } = access.active;
  const courseId = first(sp.courseId) || session.courseId;
  const claims = claimsFromSession(session);

  let documents: DocumentSummary[] = [];
  let chapters: Chapter[] = [];
  let error = "";
  try {
    [documents, chapters] = await Promise.all([
      coreApi.listDocuments<DocumentSummary[]>({ courseId, limit: 100 }, claims),
      coreApi.listChapters<Chapter[]>(courseId, claims).catch(() => []),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Không thể tải danh sách tài liệu.";
  }
  const actionError = first(sp.reviewError);
  const actionSuccess = first(sp.reviewSuccess);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Instructor</p>
            <h1 className="text-xl font-semibold">Tài liệu khóa học</h1>
            <p className="mt-1 text-sm text-slate-600">
              Đồng bộ từ Module trên Canvas hoặc upload trực tiếp; theo dõi pipeline và chương của từng tài liệu.
            </p>
          </div>
          <InstructorNav active="documents" courseId={session.courseId} sid={sid} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {actionError && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {actionSuccess && (
          <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold">Tài liệu từ Canvas</p>
            <p className="mt-1 text-sm text-slate-600">
              Lấy file trong các Module của khoá học. Module &quot;Slides&quot;, &quot;References&quot;… đều được; chương
              của từng file được xác định theo tên module, tên file hoặc nội dung.
            </p>
          </div>
          <form method="post" action={withSid("/api/documents/canvas-sync", sid)}>
            <input type="hidden" name="courseId" value={courseId} />
            <button className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Đồng bộ từ Canvas
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <UploadForm
            courseId={courseId}
            sid={sid}
            initialMessage={first(sp.uploadError)}
          />
          {error && <p className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Tài liệu</th>
                <th className="px-4 py-3">Vai trò &amp; chương</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Chunks</th>
                <th className="px-4 py-3 text-right">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {documents.map((doc) => (
                <tr key={doc.document_id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{doc.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {doc.source === "canvas" ? `Canvas · ${doc.lms_module ?? "module"}` : "Upload trực tiếp"}
                      {doc.lms_published === false && " · chưa publish"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <form
                      method="post"
                      action={withSid(`/api/documents/${doc.document_id}/placement`, sid)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <select
                        name="role"
                        defaultValue={doc.role}
                        aria-label="Vai trò"
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        {(Object.keys(ROLE_LABEL) as DocumentRole[]).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                      <select
                        name="chapterCode"
                        defaultValue={doc.chapter_provenance === "confirmed" ? doc.chapter_code ?? "" : ""}
                        aria-label="Chương"
                        className="max-w-56 rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="">Tự động</option>
                        {chapters.map((chapter) => (
                          <option key={chapter.code} value={chapter.code}>
                            Chương {chapter.code}. {chapter.title}
                          </option>
                        ))}
                      </select>
                      <button className="rounded border border-slate-300 px-3 py-1 text-sm font-medium hover:border-slate-500">
                        Lưu
                      </button>
                    </form>
                    <p className="mt-1 text-xs text-slate-500">{placementNote(doc, chapters)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{doc.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{doc.chunks_count}</td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                  </td>
                </tr>
              ))}
              {documents.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Chưa có tài liệu trong khóa học này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
