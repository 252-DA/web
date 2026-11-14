const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SUBMISSION_PATH = new RegExp(
  `^/learn/quizzes/(${UUID})/submissions/(${UUID})$`,
  "i",
);

/** Đường dẫn trang xem bài làm mà DA gửi cho Canvas trong điểm AGS. */
export function submissionViewPath(quizSetId: string, submissionId: string) {
  return `/learn/quizzes/${quizSetId}/submissions/${submissionId}`;
}

/**
 * SpeedGrader launch DA bằng đúng URL trong `submission_data` của điểm AGS
 * (core-api: AgsPublisherService). Launch mang URL đó ở claim target_link_uri.
 * Chỉ nhận URL cùng origin với tool và đúng dạng trang xem bài làm; id lấy ra
 * rồi đường dẫn đích được dựng lại từ chúng, không bao giờ lấy nguyên chuỗi.
 * `targetLinkUri` phải đến từ id_token đã xác thực chữ ký.
 */
export function parseSubmissionViewUri(
  targetLinkUri: unknown,
  toolOrigin: string,
): { quizSetId: string; submissionId: string } | null {
  if (typeof targetLinkUri !== "string") return null;
  let url: URL;
  try {
    url = new URL(targetLinkUri);
  } catch {
    return null;
  }
  if (
    url.origin !== toolOrigin ||
    url.username ||
    url.password ||
    !/^https?:$/.test(url.protocol)
  )
    return null;
  const match = SUBMISSION_PATH.exec(url.pathname);
  if (!match) return null;
  return {
    quizSetId: match[1].toLowerCase(),
    submissionId: match[2].toLowerCase(),
  };
}

/** Ai được xem bài làm của sinh viên: giảng viên, trợ giảng hoặc quản trị. */
export function canViewSubmissions(
  role: string,
  courseRole: string,
): boolean {
  return (
    role === "administrator" || courseRole === "instructor" || courseRole === "ta"
  );
}
