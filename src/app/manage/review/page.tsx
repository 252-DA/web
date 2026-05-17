import { readLtiSession } from "@/lib/session";

// Updated for Next.js 16: params is a Promise
interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface DocumentSummary {
  document_id: string;
  document_name: string;
  doc_type: string;
  status: string;
  course_id: string | null;
  created_at: string;
  chunk_count: number;
}

export default async function ReviewPage({ searchParams }: Props) {
  // ── Read session ──
  const sp = await searchParams;
  const activeSession = await readLtiSession(sp?.sid);
  if (!activeSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Phiên hết hạn</h1>
          <p className="text-gray-600">Vui lòng mở lại từ LMS.</p>
        </div>
      </div>
    );
  }

  const { session } = activeSession;

  // ── Role check: only instructors ──
  const isInstructor = session.roles?.some(
    (r: string) => r.includes("Instructor") || r.includes("Administrator")
  );
  if (!isInstructor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Không có quyền truy cập</h1>
          <p className="text-gray-600">Chỉ giảng viên mới có thể xem trang này.</p>
        </div>
      </div>
    );
  }

  // ── Fetch documents from HTTP API ──
  const courseId = (sp?.course_id as string) || session.courseId || "";

  let docs: DocumentSummary[] = [];
  let errorMsg = "";

  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://http-api:8000";
    const params = new URLSearchParams();
    if (courseId) params.set("course_id", courseId);
    params.set("limit", "100");

    const res = await fetch(`${backendUrl}/api/documents?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docs = await res.json();
  } catch (err: any) {
    errorMsg = err.message || "Không thể tải danh sách tài liệu.";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-800">Quản lý tài liệu</h1>
          <p className="text-sm text-gray-500">
            Instructor: {session.displayName || session.email}
            {courseId && <> • Course: {courseId}</>}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{errorMsg}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Tên tài liệu</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Loại</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Trạng thái</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Course</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-gray-600">Chunks</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-gray-600">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.length === 0 && !errorMsg && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    Chưa có tài liệu nào. Upload qua Swagger tại /docs.
                  </td>
                </tr>
              )}
              {docs.map((doc) => (
                <tr key={doc.document_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {doc.document_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 uppercase">{doc.doc_type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                        doc.status === "DONE" || doc.status === "ENRICHED"
                          ? "bg-green-100 text-green-700"
                          : doc.status === "ERROR"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {doc.course_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">
                    {doc.chunk_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">
                    {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
