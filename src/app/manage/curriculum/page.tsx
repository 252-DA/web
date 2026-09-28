import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { AutoRefresh } from "./components/auto-refresh";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type ImportStatus = "QUEUED" | "EXTRACTING" | "READY" | "BLOCKED" | "FAILED" | "APPLYING" | "APPLIED";

type Preview = {
  course: {
    code: string;
    title_vi: string;
    title_en: string | null;
    credits: number | null;
    semester: string | null;
    syllabus_version: string | null;
  };
  counts: {
    chapters: number;
    learning_outcomes: number;
    assessments: number;
    sessions: number;
  };
  chapters: { code: string; title: string; lo_codes: string[] }[];
  learning_outcomes: {
    code: string;
    parent_code: string | null;
    statement_vi: string;
    bloom_level: string | null;
    bloom_provenance: string;
  }[];
  issues: {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    source: { section: string; page: number | null } | null;
  }[];
  blocking: boolean;
};

type CurriculumImport = {
  import_id: string;
  file_name: string;
  status: ImportStatus;
  error: string | null;
  preview: Preview | null;
  created_at: string;
  applied_at: string | null;
};

const IN_PROGRESS: ImportStatus[] = ["QUEUED", "EXTRACTING", "APPLYING"];

const STATUS_LABEL: Record<ImportStatus, string> = {
  QUEUED: "Đang chờ",
  EXTRACTING: "Đang trích xuất",
  READY: "Chờ duyệt",
  BLOCKED: "Sai cấu trúc",
  FAILED: "Lỗi",
  APPLYING: "Đang áp dụng",
  APPLIED: "Đã áp dụng",
};

const STATUS_STYLE: Record<ImportStatus, string> = {
  QUEUED: "bg-slate-100 text-slate-700",
  EXTRACTING: "bg-sky-100 text-sky-800",
  READY: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-800",
  FAILED: "bg-red-100 text-red-800",
  APPLYING: "bg-sky-100 text-sky-800",
  APPLIED: "bg-emerald-100 text-emerald-800",
};

const ISSUE_STYLE = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

const BLOOM_LABEL: Record<string, string> = {
  remember: "Nhớ",
  understand: "Hiểu",
  apply: "Áp dụng",
  analyze: "Phân tích",
  evaluate: "Đánh giá",
  create: "Sáng tạo",
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

function formatTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function StatusBadge({ status }: { status: ImportStatus }) {
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ImportPreview({ preview }: { preview: Preview }) {
  const { course, counts } = preview;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">
          {course.code} – {course.title_vi}
        </p>
        <p className="text-sm text-slate-600">
          {[course.title_en, course.credits ? `${course.credits} tín chỉ` : null, course.semester, course.syllabus_version]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Chương", counts.chapters],
          ["Chuẩn đầu ra", counts.learning_outcomes],
          ["Hoạt động đánh giá", counts.assessments],
          ["Buổi học", counts.sessions],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {preview.issues.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Cần soát ({preview.issues.length})</h3>
          {preview.issues.map((issue, index) => (
            <p key={`${issue.code}-${index}`} className={`rounded border px-3 py-2 text-sm ${ISSUE_STYLE[issue.severity]}`}>
              {issue.message}
              {issue.source && (
                <span className="ml-2 text-xs opacity-70">
                  (mục {issue.source.section}
                  {issue.source.page ? `, trang ${issue.source.page}` : ""})
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-20 px-4 py-2">Chương</th>
              <th className="px-4 py-2">Tên chương</th>
              <th className="px-4 py-2">Chuẩn đầu ra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {preview.chapters.map((chapter) => (
              <tr key={chapter.code}>
                <td className="px-4 py-2 tabular-nums">{chapter.code}</td>
                <td className="px-4 py-2">{chapter.title}</td>
                <td className="px-4 py-2 text-slate-600">{chapter.lo_codes.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-24 px-4 py-2">Mã</th>
              <th className="px-4 py-2">Chuẩn đầu ra</th>
              <th className="w-36 px-4 py-2">Bloom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {preview.learning_outcomes.map((lo) => (
              <tr key={lo.code}>
                <td className={`px-4 py-2 font-medium ${lo.parent_code ? "pl-8" : ""}`}>{lo.code}</td>
                <td className="px-4 py-2">{lo.statement_vi}</td>
                <td className="px-4 py-2 text-slate-600">
                  {lo.bloom_level ? BLOOM_LABEL[lo.bloom_level] ?? lo.bloom_level : "—"}
                  {lo.bloom_level && lo.bloom_provenance === "inferred" && (
                    <span className="ml-1 text-xs text-amber-700">(đề xuất)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function CurriculumPage({ searchParams }: Props) {
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

  let imports: CurriculumImport[] = [];
  let chapterCount = 0;
  let loCount = 0;
  let error = "";
  try {
    const [importRows, chapters, learningOutcomes] = await Promise.all([
      coreApi.listCurriculumImports<CurriculumImport[]>({ courseId, limit: 10 }, claims),
      coreApi.listChapters<unknown[]>(courseId, claims),
      coreApi.listLearningOutcomes<unknown[]>(courseId, claims),
    ]);
    imports = importRows ?? [];
    chapterCount = chapters?.length ?? 0;
    loCount = learningOutcomes?.length ?? 0;
  } catch (err) {
    error = err instanceof Error ? err.message : "Không thể tải đề cương.";
  }

  const latest = imports[0];
  const history = imports.slice(1);
  const actionError = first(sp.reviewError);
  const actionSuccess = first(sp.reviewSuccess);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {latest && IN_PROGRESS.includes(latest.status) && <AutoRefresh />}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Instructor</p>
          <h1 className="text-xl font-semibold">Đề cương môn học</h1>
          <p className="mt-1 text-sm text-slate-600">
            Lấy đề cương từ trang Chương trình học trên Canvas, duyệt phần trích xuất rồi áp dụng cho khoá học.
          </p>
          <InstructorNav active="curriculum" courseId={session.courseId} sid={sid} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {actionSuccess && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold">Đề cương đang dùng</p>
            <p className="mt-1 text-sm text-slate-600">
              {loCount > 0
                ? `${chapterCount} chương · ${loCount} chuẩn đầu ra`
                : "Chưa có. Đính kèm file PDF đề cương vào trang Chương trình học trên Canvas rồi đồng bộ."}
            </p>
          </div>
          <form method="post" action={withSid("/api/curriculum/sync", sid)}>
            <input type="hidden" name="courseId" value={courseId} />
            <button className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Đồng bộ từ Canvas
            </button>
          </form>
        </div>

        {latest && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={latest.status} />
                <span className="font-medium">{latest.file_name}</span>
              </div>
              <span className="text-sm text-slate-500">{formatTime(latest.created_at)}</span>
            </div>

            <div className="space-y-4 px-4 pb-4">
              {latest.error && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{latest.error}</p>
              )}
              {latest.status === "BLOCKED" && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Đề cương có lỗi cấu trúc nên chưa áp dụng được. Sửa file trên Canvas rồi đồng bộ lại.
                </p>
              )}
              {latest.status === "READY" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-sm text-amber-900">
                    Kiểm tra phần trích xuất bên dưới. Áp dụng sẽ thay đề cương đang dùng của khoá học.
                  </p>
                  <form method="post" action={withSid(`/api/curriculum/imports/${latest.import_id}/apply`, sid)}>
                    <button className="rounded border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">
                      Áp dụng đề cương
                    </button>
                  </form>
                </div>
              )}
              {IN_PROGRESS.includes(latest.status) && (
                <p className="text-sm text-slate-600">Đang xử lý, trang sẽ tự cập nhật…</p>
              )}
              {latest.preview && <ImportPreview preview={latest.preview} />}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <p className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Các lần đồng bộ trước</p>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-200">
                {history.map((item) => (
                  <tr key={item.import_id}>
                    <td className="px-4 py-2">{item.file_name}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{formatTime(item.created_at)}</td>
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
