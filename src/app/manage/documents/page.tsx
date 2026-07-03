import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { UploadForm } from "./components/upload-form";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type DocumentSummary = {
  document_id: string;
  title: string;
  mime_type: string | null;
  status: string;
  created_at: string;
  chunks_count: number;
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

export default async function DocumentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }

  const { sid, session } = active;
  const courseId = first(sp.courseId) || session.courseId;
  const claims = claimsFromSession(session);

  let documents: DocumentSummary[] = [];
  let error = "";
  try {
    documents = await coreApi.listDocuments<DocumentSummary[]>({ courseId, limit: 100 }, claims);
  } catch (err) {
    error = err instanceof Error ? err.message : "Không thể tải danh sách tài liệu.";
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Instructor</p>
            <h1 className="text-xl font-semibold">Tài liệu khóa học</h1>
            <p className="mt-1 text-sm text-slate-600">Upload tài liệu, theo dõi pipeline và trạng thái chunking.</p>
          </div>
          <InstructorNav active="documents" courseId={session.courseId} sid={sid} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <UploadForm courseId={courseId} sid={sid} />
          {error && <p className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">MIME</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Chunks</th>
                <th className="px-4 py-3 text-right">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {documents.map((doc) => (
                <tr key={doc.document_id}>
                  <td className="px-4 py-3 font-medium">{doc.title}</td>
                  <td className="px-4 py-3 text-slate-600">{doc.mime_type || "unknown"}</td>
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
