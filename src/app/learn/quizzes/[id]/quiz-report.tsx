import { GRADE_SYNC, type StaffQuizResults } from "@/lib/canvas-quiz";
import { answerKey, bloomLabel, quizChoices } from "@/lib/quiz";

const time = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function Rate({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const tone = value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="tabular-nums">{value}%</span>
    </span>
  );
}

/** Trang giảng viên thấy khi mở bài tập quiz DA từ Canvas. */
export function QuizReport({ report }: { report: StaffQuizResults }) {
  const { summary } = report;
  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <p className="text-sm text-slate-500">DA Platform · Kết quả quiz</p>
          <h1 className="mt-1 text-2xl font-semibold">{report.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {report.settings.mode === "exam" ? "Kiểm tra" : "Luyện tập"} · {report.items.length} câu ·{" "}
            {report.settings.pointsPossible} điểm
            {report.settings.mode === "exam" && (
              <>
                {" "}
                · {report.settings.timeLimitMinutes ? `${report.settings.timeLimitMinutes} phút` : "không giới hạn giờ"} ·{" "}
                {report.settings.maxAttempts ? `${report.settings.maxAttempts} lần làm` : "không giới hạn lần làm"}
                {report.settings.dueAt && ` · hạn ${time.format(new Date(report.settings.dueAt))}`}
              </>
            )}{" "}
            · Canvas ghi điểm cao nhất của mỗi sinh viên
          </p>
        </header>

        {summary.waitingForPublish > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Bài tập chưa được <strong>Publish</strong> trên Canvas nên điểm của {summary.waitingForPublish} sinh viên đang
            chờ. Vào Modules bấm Publish, điểm sẽ tự vào sổ trong vài phút.
          </p>
        )}
        {summary.failed > 0 && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Điểm của {summary.failed} sinh viên gửi về Canvas bị lỗi. Kiểm tra cột điểm của bài tập còn tồn tại không.
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            ["Sinh viên đã làm", summary.students],
            ["Lượt nộp", summary.submissions],
            ["Điểm cao nhất trung bình", summary.averageBest === null ? "—" : `${summary.averageBest}/100`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </section>

        {!summary.students ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Chưa có sinh viên nộp bài. Nhớ Publish bài tập trên Canvas để sinh viên thấy bài.
          </p>
        ) : (
          <>
            {report.byLo.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="font-semibold">Theo chuẩn đầu ra</h2>
                <p className="text-xs text-slate-500">Tỉ lệ trả lời đúng, tính theo lượt làm gần nhất của mỗi sinh viên.</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {report.byLo.map((lo) => (
                    <li key={lo.lo_id} className="flex flex-wrap items-center gap-3">
                      <span className="w-16 font-semibold">{lo.code}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-600" title={lo.statement}>
                        {lo.statement}
                      </span>
                      <span className="text-xs text-slate-500">{lo.questions} câu</span>
                      <Rate value={lo.correctRate} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Sinh viên</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3 font-medium">Họ tên</th>
                      <th className="py-2 pr-3 font-medium">Lượt</th>
                      <th className="py-2 pr-3 font-medium">Cao nhất</th>
                      <th className="py-2 pr-3 font-medium">Gần nhất</th>
                      <th className="py-2 pr-3 font-medium">Nộp lúc</th>
                      <th className="py-2 font-medium">Sổ điểm Canvas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.map((s) => (
                      <tr key={s.userId} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3">{s.name}</td>
                        <td className="py-2 pr-3 tabular-nums">{s.attempts}</td>
                        <td className="py-2 pr-3 font-semibold tabular-nums">{s.bestScore}</td>
                        <td className="py-2 pr-3 tabular-nums">{s.latestScore}</td>
                        <td className="py-2 pr-3 text-slate-600">{time.format(new Date(s.lastAttemptedAt))}</td>
                        <td className="py-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${GRADE_SYNC[s.sync].tone}`}>
                            {GRADE_SYNC[s.sync].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <section className="space-y-3">
          <h2 className="font-semibold">Câu hỏi và đáp án</h2>
          {report.items.map((item, index) => {
            const correctKey = answerKey(item.correct_answer);
            const rate = item.answered ? Math.round((100 * item.correct) / item.answered) : null;
            return (
              <article key={item.quiz_id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Câu {index + 1}
                    {item.lo_code && <> · <strong className="text-slate-700">{item.lo_code}</strong></>} ·{" "}
                    {bloomLabel(item.bloom_level)}
                  </span>
                  {item.answered > 0 && (
                    <span className="flex items-center gap-2">
                      Đúng {item.correct}/{item.answered} <Rate value={rate} />
                    </span>
                  )}
                </div>
                <p className="mt-2 font-medium leading-6">{item.question}</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {quizChoices(item.options).map((c, i) => {
                    const correct = answerKey(c.value) === correctKey;
                    return (
                      <p
                        key={c.key}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700"}`}
                      >
                        <strong>{String.fromCharCode(65 + i)}.</strong> {c.label}
                        {correct && <span className="ml-1 text-xs">✓</span>}
                      </p>
                    );
                  })}
                </div>
                {item.explanation && (
                  <details className="mt-2 text-sm text-slate-600">
                    <summary className="cursor-pointer text-xs text-slate-500">Giải thích</summary>
                    <p className="mt-1 leading-6">{item.explanation}</p>
                  </details>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
