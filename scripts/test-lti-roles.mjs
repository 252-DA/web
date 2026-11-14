import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const asModule = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const load = async (path) =>
  import(
    asModule(
      ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    )
  );

const { mapRoles, UnsupportedRoleError } = await load("../src/lib/lti-roles.ts");
const { sessionTtlFor, renewalTtl, SESSION_TTL, SESSION_MAX_AGE, EXAM_SESSION_MARGIN } =
  await load("../src/lib/session-ttl.ts");
const { parseSubmissionViewUri, canViewSubmissions, submissionViewPath } = await load(
  "../src/lib/lti-submission-view.ts",
);

// ── mapRoles: URI chính xác, TA trước Instructor, role lạ trả 403 ──
const M = "http://purl.imsglobal.org/vocab/lis/v2/membership";
const I = "http://purl.imsglobal.org/vocab/lis/v2/institution/person";
const S = "http://purl.imsglobal.org/vocab/lis/v2/system/person";
const roles = (...r) => mapRoles(r);

// Canvas gửi TA kèm membership#Instructor: phải ra TA, không phải giảng viên.
assert.deepEqual(roles(`${M}/Instructor#TeachingAssistant`, `${M}#Instructor`, `${I}#Instructor`, `${S}#User`), {
  role: "instructor",
  courseRole: "ta",
});
assert.deepEqual(roles(`${M}#Instructor`, `${I}#Instructor`), { role: "instructor", courseRole: "instructor" });
assert.deepEqual(roles(`${M}#ContentDeveloper`), { role: "instructor", courseRole: "instructor" });
assert.deepEqual(roles(`${M}#Learner`, `${I}#Student`, `${S}#User`), { role: "learner", courseRole: "learner" });
assert.deepEqual(roles(`${M}#Mentor`), { role: "learner", courseRole: "observer" });
assert.deepEqual(roles(`${M}#Member`), { role: "learner", courseRole: "learner" });
assert.deepEqual(roles(`${I}#Administrator`, `${S}#SysAdmin`), { role: "administrator", courseRole: "instructor" });
assert.deepEqual(roles(`${I}#Administrator`, `${M}#Learner`), { role: "administrator", courseRole: "instructor" });
// Giảng viên của khóa khác nhưng là sinh viên ở khóa này: vai trò trong khóa quyết định.
assert.deepEqual(roles(`${I}#Instructor`, `${M}#Learner`), { role: "learner", courseRole: "learner" });
// Không có role trong khóa (launch ngoài khóa học) thì dùng role cấp trường.
assert.deepEqual(roles(`${I}#Instructor`), { role: "instructor", courseRole: "instructor" });
assert.deepEqual(roles(`${I}#Student`), { role: "learner", courseRole: "learner" });
// Tên ngắn của LTI 1.3 cho role cốt lõi.
assert.deepEqual(roles("Learner"), { role: "learner", courseRole: "learner" });
assert.deepEqual(roles("Instructor"), { role: "instructor", courseRole: "instructor" });

// Role lạ trả 403, không rơi thành sinh viên. Trước đây mọi URI chứa "membership"
// đều khớp "Member", và "TA" khớp bất kỳ chuỗi nào có chữ TA.
for (const unknown of [
  [],
  [`${S}#User`],
  [`${M}#Officer`],
  [`${M}#Manager`],
  ["http://purl.imsglobal.org/vocab/lis/v2/person#None"],
  ["Student"],
  ["TeachingAssistant"],
  [`${M}#instructor`],
  ["http://evil.test/membership#Instructor"],
]) {
  assert.throws(() => mapRoles(unknown), UnsupportedRoleError, JSON.stringify(unknown));
}
assert.equal(new UnsupportedRoleError().status, 403);

// ── TTL phiên ──
assert.equal(SESSION_TTL, 1800);
assert.equal(sessionTtlFor(undefined), SESSION_TTL);
assert.equal(sessionTtlFor(null), SESSION_TTL);
assert.equal(sessionTtlFor(0), SESSION_TTL);
assert.equal(sessionTtlFor(-5), SESSION_TTL);
assert.equal(sessionTtlFor(Number.NaN), SESSION_TTL);
// Thời gian làm + 10 phút nếu dài hơn 30 phút, ngược lại giữ 30 phút.
assert.equal(sessionTtlFor(10), SESSION_TTL);
assert.equal(sessionTtlFor(20), SESSION_TTL);
assert.equal(sessionTtlFor(21), 21 * 60 + EXAM_SESSION_MARGIN);
assert.equal(sessionTtlFor(60), 70 * 60);
assert.equal(sessionTtlFor(90.2), 91 * 60 + EXAM_SESSION_MARGIN);
assert.equal(sessionTtlFor(600), 610 * 60);
assert.equal(sessionTtlFor(100000), SESSION_MAX_AGE);

// Gia hạn trượt: đẩy hạn ra thêm TTL, nhưng không quá trần tuyệt đối.
const now = 1_800_000_000;
assert.equal(renewalTtl(undefined, undefined, now), SESSION_TTL);
assert.equal(renewalTtl(4200, undefined, now), 4200);
assert.equal(renewalTtl(4200, now - 60, now), 4200);
assert.equal(renewalTtl(1800, now - SESSION_MAX_AGE + 600, now), 600);
assert.equal(renewalTtl(1800, now - SESSION_MAX_AGE, now), 0);
assert.equal(renewalTtl(1800, now - SESSION_MAX_AGE - 10, now), 0);
assert.equal(renewalTtl(0, now, now), SESSION_TTL);

// ── URL bài làm của SpeedGrader ──
const TOOL = "https://tool.test";
const SET = "0197a1b2-c3d4-7e5f-8a6b-1c2d3e4f5a6b";
const SUB = "0197a1b2-c3d4-7e5f-8a6b-aabbccddeeff";
const parse = (uri) => parseSubmissionViewUri(uri, TOOL);
assert.deepEqual(parse(`${TOOL}/learn/quizzes/${SET}/submissions/${SUB}`), {
  quizSetId: SET,
  submissionId: SUB,
});
// Round trip với URL mà core-api gửi cho Canvas.
assert.deepEqual(parse(`${TOOL}${submissionViewPath(SET, SUB)}`), { quizSetId: SET, submissionId: SUB });
// Query do Canvas thêm vào không làm hỏng; id viết hoa được chuẩn hóa.
assert.deepEqual(parse(`${TOOL}/learn/quizzes/${SET.toUpperCase()}/submissions/${SUB}?x=1`), {
  quizSetId: SET,
  submissionId: SUB,
});
for (const bad of [
  undefined,
  null,
  42,
  "",
  "không phải url",
  `https://evil.test/learn/quizzes/${SET}/submissions/${SUB}`,
  `http://tool.test/learn/quizzes/${SET}/submissions/${SUB}`,
  `https://tool.test:8443/learn/quizzes/${SET}/submissions/${SUB}`,
  `https://user:pass@tool.test/learn/quizzes/${SET}/submissions/${SUB}`,
  `${TOOL}/learn/quizzes/${SET}`,
  `${TOOL}/learn/quizzes/${SET}/submissions`,
  `${TOOL}/learn/quizzes/${SET}/submissions/${SUB}/extra`,
  `${TOOL}/learn/quizzes/${SET}/submissions/not-a-uuid`,
  `${TOOL}/learn/quizzes/../admin/submissions/${SUB}`,
  `${TOOL}/learn/quizzes/${SET}/submissions/${SUB}%2f..%2fadmin`,
  `${TOOL}/manage/dashboard`,
  `javascript:alert(1)`,
]) {
  assert.equal(parse(bad), null, String(bad));
}

assert.equal(canViewSubmissions("instructor", "instructor"), true);
assert.equal(canViewSubmissions("instructor", "ta"), true);
assert.equal(canViewSubmissions("administrator", "instructor"), true);
assert.equal(canViewSubmissions("learner", "learner"), false);
assert.equal(canViewSubmissions("learner", "observer"), false);
// Giảng viên của khóa khác nhưng sinh viên ở khóa này không được xem bài người khác.
assert.equal(canViewSubmissions("instructor", "learner"), false);

console.log("lti roles, session ttl and submission view checks passed");
