import { coreApi, claimsFromSession } from "@/lib/core-api";
import { readLtiSession } from "@/lib/session";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Criterion = { criterion: string; points: number; max_points: number; comment: string };
type Report = {
  title: string;
  max_score: number;
  status: "RECEIVED" | "QUEUED" | "GRADED" | "REPORTED" | "FAILED";
  result: { score: number; max_score: number; criteria: Criterion[]; feedback: string; truncated?: boolean } | null;
  error: string | null;
  received_at: string;
  is_teacher: boolean;
};

const STATUS: Record<Report["status"], string> = {
  RECEIVED: "Đã nhận bài, đang tải file",
  QUEUED: "AI đang chấm",
  GRADED: "Đã chấm, đang gửi về Canvas",
  REPORTED: "Đã chấm",
  FAILED: "AI không chấm được — giảng viên chấm tay",
};

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/** Trang "View report" Canvas mở từ SpeedGrader (LtiReportReviewRequest). */
export default async function EssayReportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const active = await readLtiSession(first(sp.sid));
  if (!active) return <main className="p-8 text-slate-700">Phiên hết hạn. Mở lại báo cáo từ Canvas.</main>;

  let reports: Report[] = [];
  let error = "";
  try {
    reports = await coreApi.getEssayReport<Report[]>(
      { submissionId: first(sp.submission) || "", userSub: active.session.lmsSub },
      claimsFromSession(active.session),
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được báo cáo.";
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">DA Platform · Báo cáo chấm bài</p>
          <h1 className="text-xl font-semibold">Điểm gợi ý của AI</h1>
          <p className="mt-1 text-sm text-slate-600">AI chấm theo rubric của giảng viên. Điểm trong sổ điểm do giảng viên quyết định.</p>
        </header>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {reports.map((report, i) => (
          <section key={i} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <p className="font-semibold">{report.title}</p>
              <p className="text-sm text-slate-600">
                {report.result ? (
                  <span className="text-lg font-semibold text-slate-950">
                    {report.result.score}/{report.result.max_score}
                  </span>
                ) : (
                  STATUS[report.status]
                )}
              </p>
            </div>
            {report.result ? (
              <div className="space-y-3 px-4 py-3 text-sm">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    {report.result.criteria.map((c) => (
                      <tr key={c.criterion}>
                        <td className="py-2 pr-3 align-top font-medium">{c.criterion}</td>
                        <td className="whitespace-nowrap py-2 pr-3 align-top">
                          {c.points}/{c.max_points}
                        </td>
                        <td className="py-2 align-top text-slate-600">{c.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.result.feedback && <p className="text-slate-700">{report.result.feedback}</p>}
                {report.result.truncated && <p className="text-amber-700">Bài quá dài nên AI chỉ đọc phần đầu.</p>}
              </div>
            ) : (
              report.error && <p className="px-4 py-3 text-sm text-red-700">{report.error}</p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
