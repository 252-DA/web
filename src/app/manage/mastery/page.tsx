import { readManageSession } from "@/lib/session";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import {
  STATUS_META,
  bloomLabel,
  formatDateTime,
  masteryCellClass,
  pct,
  pendingLabel,
  type CourseMastery,
  type LearnerSummary,
} from "@/lib/mastery";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Course = { course_id: string; code: string; subject_code?: string | null; name: string };

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function ManageMasteryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(first(sp.sid));
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Trang này chỉ dành cho giảng viên và trợ giảng.</main>;
  }

  const { sid, session } = access.active;
  const courseId = session.courseId;
  const claims = claimsFromSession(session);
  const selectedUserId = first(sp.userId);

  let course: Course | null = null;
  let data: CourseMastery | null = null;
  let selected: LearnerSummary | null = null;
  try {
    [course, data] = await Promise.all([
      coreApi.getCourse<Course>(courseId, claims),
      coreApi.courseMastery<CourseMastery>(courseId, claims),
    ]);
    if (selectedUserId) {
      selected = await coreApi.learnerSummary<LearnerSummary>(
        { courseId, userId: selectedUserId },
        claims,
      );
    }
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <main className="p-8 text-slate-700">
        Không lấy được dữ liệu mức nắm. Vui lòng thử lại sau.
      </main>
    );
  }

  const threshold = data.model.threshold;
  const totalMasteredCells = data.students.reduce(
    (sum, s) => sum + s.los.filter((lo) => lo.status === "mastered").length,
    0,
  );
  const totalCells = data.students.length * data.los.length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">{course ? (course.subject_code ?? course.code) : ""}</p>
          <h1 className="text-2xl font-semibold">Mức nắm theo chuẩn đầu ra</h1>
          <p className="mt-1 text-sm text-slate-600">
            {course?.name ?? ""} · {data.students.length} sinh viên · {data.los.length} LO · mô hình{" "}
            {data.model.policy} · ngưỡng đạt {pct(threshold)} sau ít nhất{" "}
            {data.model.minObservations} quan sát
          </p>
          <InstructorNav
            active="mastery"
            courseId={courseId}
            sid={sid}
            isAdmin={session.role === "administrator"}
          />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {/* Kho câu luyện theo LO */}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Kho câu luyện và tỉ lệ đạt theo LO
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.los.map((lo) => (
            <div
              key={lo.loId}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                lo.bank.low ? "border-amber-300" : "border-slate-200"
              }`}
              title={lo.statement}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                  {lo.code}
                </span>
                {bloomLabel(lo.bloomLevel) && (
                  <span className="text-xs text-indigo-600">{bloomLabel(lo.bloomLevel)}</span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 min-h-10 text-xs text-slate-600">{lo.statement}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-400">Câu luyện</dt>
                  <dd className={`text-base font-semibold ${lo.bank.low ? "text-amber-600" : "text-slate-900"}`}>
                    {lo.bank.practice}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-400">Trong đề</dt>
                  <dd className="text-base font-semibold text-slate-900">{lo.bank.inExam}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-400">SV đạt</dt>
                  <dd className="text-base font-semibold text-emerald-700">{lo.mastered}</dd>
                </div>
              </dl>
              {lo.bank.low && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Kho luyện dưới {data.minPracticeItems} câu — chưa đủ để mô hình kết luận chắc.
                </p>
              )}
            </div>
          ))}
          {data.los.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Khóa học chưa có chuẩn đầu ra nào.
            </p>
          )}
        </div>

        {/* Chi tiết một sinh viên khi chọn */}
        {selected && (
          <div className="mt-8 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">
                Chi tiết:{" "}
                {data.students.find((s) => s.userId === selected.userId)?.name ?? selected.userId}
              </h2>
              <a
                href={withSid("/manage/mastery", sid)}
                className="text-sm font-medium text-sky-700 hover:underline"
              >
                ← Quay lại bảng tổng
              </a>
            </div>
            <div className="mt-4 space-y-3">
              {selected.los.map((lo) => {
                const meta = STATUS_META[lo.status];
                const pending = pendingLabel(lo.pending);
                return (
                  <div key={lo.loId} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                          {lo.code}
                        </span>
                        <span className="text-sm text-slate-700">{lo.statement}</span>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${meta.badge}`}>
                        {meta.label} · {pct(lo.mastery)}
                      </span>
                    </div>
                    <div className="relative mt-3 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${meta.bar}`}
                        style={{ width: `${Math.round(lo.mastery * 100)}%` }}
                      />
                      <div
                        className="absolute -top-0.5 h-3 w-0.5 bg-slate-400"
                        style={{ left: `calc(${Math.round(threshold * 100)}% - 1px)` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {lo.observations} quan sát · {lo.correct} đúng
                      {lo.consecutiveWrong > 0 ? ` · sai liên tiếp ${lo.consecutiveWrong}` : ""}
                      {lo.lastObservedAt ? ` · hoạt động cuối ${formatDateTime(lo.lastObservedAt)}` : ""}
                      {lo.firstMasteredAt ? ` · đạt lần đầu ${formatDateTime(lo.firstMasteredAt)}` : ""}
                    </p>
                    {pending && <p className="mt-1 text-xs text-amber-700">Đang chờ: {pending}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Ma trận sinh viên × LO */}
        <div className="mt-8 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ma trận mức nắm
          </h2>
          <p className="text-xs text-slate-500">
            {totalMasteredCells}/{totalCells} ô đạt · bấm vào tên để xem chi tiết
          </p>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-10 min-w-48 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sinh viên
                </th>
                {data.los.map((lo) => (
                  <th
                    key={lo.loId}
                    className="min-w-20 px-2 py-3 text-center text-xs font-semibold text-slate-600"
                    title={`${lo.code}: ${lo.statement}`}
                  >
                    {lo.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.students.map((student) => {
                const stateByLo = new Map(student.los.map((lo) => [lo.loId, lo]));
                const masteredCount = student.los.filter((lo) => lo.status === "mastered").length;
                return (
                  <tr key={student.userId} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <a
                        href={withSid(`/manage/mastery?userId=${encodeURIComponent(student.userId)}`, sid)}
                        className="block"
                      >
                        <span className="block truncate font-medium text-sky-800 hover:underline">
                          {student.name ?? "(chưa có tên)"}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {masteredCount}/{data.los.length} LO đạt
                        </span>
                      </a>
                    </td>
                    {data.los.map((lo) => {
                      const state = stateByLo.get(lo.loId);
                      const tooltip = state
                        ? `${student.name ?? ""} · ${lo.code}: ${STATUS_META[state.status].label} ${pct(state.mastery)} · ${state.observations} quan sát, ${state.correct} đúng`
                        : `${lo.code}: chưa có dữ liệu`;
                      return (
                        <td key={lo.loId} className="px-1 py-1 text-center">
                          <div
                            className={`mx-auto flex h-9 w-16 items-center justify-center rounded-lg text-xs font-semibold ${masteryCellClass(state, threshold)}`}
                            title={tooltip}
                          >
                            {state && state.observations > 0 ? pct(state.mastery) : "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {data.students.length === 0 && (
                <tr>
                  <td colSpan={data.los.length + 1} className="px-4 py-8 text-center text-sm text-slate-500">
                    Chưa có sinh viên nào trong danh sách lớp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Chú thích */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-emerald-500" /> Đã thành thạo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-teal-200" /> Trên ngưỡng, chưa đủ quan sát
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-amber-300" /> Đang luyện
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-rose-300" /> Còn yếu
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-200" /> Chưa có dữ liệu
          </span>
        </div>
      </section>
    </main>
  );
}
