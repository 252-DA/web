import { readLtiSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { canViewSubmissions } from "@/lib/lti-submission-view";
import { GRADE_SYNC, type QuizSubmissionDetail } from "@/lib/canvas-quiz";
import { ExamReview } from "../../exam-review";

const time = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function message(text: string) {
  return <main className="p-8 text-slate-700">{text}</main>;
}

/**
 * Bài làm của sinh viên cho SpeedGrader. Điểm AGS của DA gửi URL trang này làm
 * bài nộp `basic_lti_launch`; Canvas launch DA vào đây khi giảng viên chấm.
 * Launch route chỉ tạo phiên dạng này cho giảng viên/trợ giảng, và core-api
 * kiểm tra lại quyền theo khóa học, nên trang không tin tham số URL.
 */
export default async function SubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, submissionId }, sp] = await Promise.all([params, searchParams]);
  const active = await readLtiSession(sp.sid);
  if (!active) return message("Phiên đã hết hạn. Mở lại bài làm từ SpeedGrader.");
  const { session } = active;
  if (!canViewSubmissions(session.role, session.courseRole))
    return message("Chỉ giảng viên và trợ giảng của khóa học xem được bài làm của sinh viên.");
  // Phiên này sinh ra từ đúng URL bài làm; không dùng nó để mở bài khác.
  if (
    session.targetKind !== "quiz_set" ||
    session.targetId !== id ||
    session.submissionId !== submissionId
  )
    return message("Mở bài làm từ SpeedGrader trong Canvas.");

  let detail: QuizSubmissionDetail;
  try {
    detail = await coreApi.quizSubmission<QuizSubmissionDetail>(
      id,
      submissionId,
      claimsFromSession(session),
    );
  } catch (error) {
    return message(error instanceof Error ? error.message : "Không tải được bài làm.");
  }

  const percent = `${detail.score}%`;
  const grade = GRADE_SYNC[detail.sync];
  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="text-sm text-slate-500">
            {detail.mode === "exam" ? "Bài kiểm tra" : "Bài luyện tập"} · {detail.title}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{detail.student.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>
              Lần {detail.attemptNumber}/{detail.attemptCount} ·{" "}
              {time.format(new Date(detail.attemptedAt))}
            </span>
            <span>
              Điểm{" "}
              <strong className="tabular-nums">
                {detail.scoreGiven}/{detail.pointsPossible}
              </strong>{" "}
              ({percent})
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${grade.tone}`}>
              {grade.label}
            </span>
          </p>
          {detail.attemptCount > 1 && (
            <p className="mt-1 text-xs text-slate-500">
              Canvas ghi điểm cao nhất của sinh viên trên bài tập này.
            </p>
          )}
        </header>
        <ExamReview review={detail.review} title="Bài làm" />
      </div>
    </main>
  );
}
