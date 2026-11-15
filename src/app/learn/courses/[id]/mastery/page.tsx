import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import {
  STATUS_META,
  bloomLabel,
  formatDateTime,
  pct,
  pendingLabel,
  type LearnerSummary,
  type LearnerSummaryLo,
} from "@/lib/mastery";

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

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function LoCard({ lo, threshold }: { lo: LearnerSummaryLo; threshold: number }) {
  const meta = STATUS_META[lo.status];
  const bloom = bloomLabel(lo.bloomLevel);
  const pending = pendingLabel(lo.pending);
  const width = Math.round(lo.mastery * 100);
  const thresholdPos = Math.round(threshold * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
              {lo.code}
            </span>
            {bloom && (
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {bloom}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{lo.statement}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${meta.badge}`}>
          {meta.label}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs text-slate-500">
          <span>Mức nắm ước lượng</span>
          <span className="text-sm font-semibold text-slate-900">{pct(lo.mastery)}</span>
        </div>
        <div className="relative mt-1 h-2.5 overflow-visible rounded-full bg-slate-100">
          <div
            className={`h-2.5 rounded-full transition-all ${meta.bar}`}
            style={{ width: `${width}%` }}
          />
          <div
            className="absolute -top-1 h-4 w-0.5 rounded bg-slate-400"
            style={{ left: `calc(${thresholdPos}% - 1px)` }}
            title={`Ngưỡng đạt ${pct(threshold)}`}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>0%</span>
          <span>Ngưỡng đạt {pct(threshold)}</span>
          <span>100%</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 sm:grid-cols-4">
        <div>
          <dt className="text-slate-400">Quan sát</dt>
          <dd className="font-semibold text-slate-800">{lo.observations}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Trả lời đúng</dt>
          <dd className="font-semibold text-slate-800">{lo.correct}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Sai liên tiếp</dt>
          <dd className={`font-semibold ${lo.consecutiveWrong > 0 ? "text-rose-600" : "text-slate-800"}`}>
            {lo.consecutiveWrong}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Hoạt động cuối</dt>
          <dd className="font-semibold text-slate-800">
            {lo.lastObservedAt ? formatDateTime(lo.lastObservedAt) : "—"}
          </dd>
        </div>
      </dl>

      {lo.firstMasteredAt && (
        <p className="mt-3 text-xs text-emerald-700">
          Đạt lần đầu: {formatDateTime(lo.firstMasteredAt)}
        </p>
      )}
      {pending && <p className="mt-3 text-xs text-amber-700">Đang chờ: {pending}</p>}
    </div>
  );
}

export default async function LearnerMasteryPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  const { sid, session } = active;
  const claims = claimsFromSession(session);

  let course: Course | null = null;
  let summary: LearnerSummary | null = null;
  try {
    [course, summary] = await Promise.all([
      coreApi.getCourse<Course>(id, claims),
      coreApi.learnerSummary<LearnerSummary>({ courseId: id }, claims),
    ]);
  } catch {
    summary = null;
  }

  if (!summary) {
    return (
      <main className="p-8 text-slate-700">
        Không lấy được dữ liệu mức nắm. Vui lòng thử lại sau.
      </main>
    );
  }

  const mastered = summary.los.filter((lo) => lo.status === "mastered").length;
  const practicing = summary.los.filter((lo) => lo.status === "practicing").length;
  const observed = summary.los.filter((lo) => lo.observations > 0);
  const avgMastery = observed.length
    ? observed.reduce((sum, lo) => sum + lo.mastery, 0) / observed.length
    : 0;
  const totalObservations = summary.los.reduce((sum, lo) => sum + lo.observations, 0);
  const isStaff =
    session.courseRole === "instructor" ||
    session.courseRole === "ta" ||
    session.role === "administrator";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">{course?.code ?? ""}</p>
          <h1 className="text-2xl font-semibold">Mức nắm của tôi</h1>
          <p className="mt-1 text-sm text-slate-600">
            {course?.name ?? ""} · Mô hình {summary.model.policy} · ngưỡng đạt{" "}
            {pct(summary.model.threshold)} sau ít nhất {summary.model.minObservations} quan sát
          </p>
          <div className="mt-3 text-sm">
            <a
              href={withSid(`/learn/courses/${id}`, sid)}
              className="font-medium text-sky-700 hover:underline"
            >
              ← Quay lại khóa học
            </a>
          </div>
          {isStaff && (
            <InstructorNav
              active="learner"
              courseId={session.courseId}
              sid={sid}
              isAdmin={session.role === "administrator"}
            />
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="LO đã đạt" value={`${mastered}/${summary.los.length}`} />
          <StatCard label="Đang luyện" value={String(practicing)} />
          <StatCard
            label="Mức nắm trung bình"
            value={observed.length ? pct(avgMastery) : "—"}
            hint="trên các LO đã có quan sát"
          />
          <StatCard label="Tổng quan sát" value={String(totalObservations)} />
        </div>

        <div className="mt-6 space-y-4">
          {summary.los.map((lo) => (
            <LoCard key={lo.loId} lo={lo} threshold={summary.model.threshold} />
          ))}
          {summary.los.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Khóa học chưa có chuẩn đầu ra nào.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
