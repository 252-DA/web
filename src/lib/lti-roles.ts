export type PlatformRole = "instructor" | "learner" | "administrator";
export type CourseRole = "instructor" | "learner" | "ta" | "observer";

/** Role lạ: không thuộc vai trò nào DA hiểu. Launch trả 403 thay vì đoán. */
export class UnsupportedRoleError extends Error {
  readonly status = 403;
  constructor() {
    super("Unsupported LTI role");
  }
}

const MEMBERSHIP = "http://purl.imsglobal.org/vocab/lis/v2/membership";
const INSTITUTION = "http://purl.imsglobal.org/vocab/lis/v2/institution/person";
const SYSTEM = "http://purl.imsglobal.org/vocab/lis/v2/system/person";

// Canvas gửi trợ giảng kèm cả membership#Instructor nên TA phải xét trước
// Instructor. Hai cách viết hoa của URI TA đều xuất hiện trong code Canvas.
const TA = new Set([
  `${MEMBERSHIP}/Instructor#TeachingAssistant`,
  `${MEMBERSHIP}/instructor#TeachingAssistant`,
]);
const INSTRUCTOR = new Set([
  `${MEMBERSHIP}#Instructor`,
  `${MEMBERSHIP}#ContentDeveloper`,
  "Instructor",
  "ContentDeveloper",
]);
const OBSERVER = new Set([`${MEMBERSHIP}#Mentor`, "Mentor"]);
const LEARNER = new Set([`${MEMBERSHIP}#Learner`, `${MEMBERSHIP}#Member`, "Learner", "Member"]);
const ADMIN = new Set([
  `${INSTITUTION}#Administrator`,
  `${SYSTEM}#SysAdmin`,
  `${SYSTEM}#Administrator`,
  "Administrator",
]);
// Role cấp trường chỉ dùng khi launch không mang role trong khóa học: một giảng
// viên của khóa khác nhưng là sinh viên ở khóa này phải là sinh viên ở đây.
const INSTITUTION_INSTRUCTOR = new Set([`${INSTITUTION}#Instructor`]);
const INSTITUTION_STUDENT = new Set([`${INSTITUTION}#Student`]);

/**
 * Đổi role của id_token thành vai trò trong DA. So khớp URI chính xác: mọi URI
 * role đều chứa "membership", nên regex theo từ khóa sẽ nhận nhầm, và role
 * lạ (không khớp URI nào) trả 403 thay vì rơi thành sinh viên.
 */
export function mapRoles(roles: readonly string[]): {
  role: PlatformRole;
  courseRole: CourseRole;
} {
  const has = (set: ReadonlySet<string>) => roles.some((role) => set.has(role));
  if (has(ADMIN)) return { role: "administrator", courseRole: "instructor" };
  if (has(TA)) return { role: "instructor", courseRole: "ta" };
  if (has(INSTRUCTOR)) return { role: "instructor", courseRole: "instructor" };
  if (has(OBSERVER)) return { role: "learner", courseRole: "observer" };
  if (has(LEARNER)) return { role: "learner", courseRole: "learner" };
  if (has(INSTITUTION_INSTRUCTOR)) return { role: "instructor", courseRole: "instructor" };
  if (has(INSTITUTION_STUDENT)) return { role: "learner", courseRole: "learner" };
  throw new UnsupportedRoleError();
}
