import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";

const dir = await mkdtemp(join(tmpdir(), "da-lti-test-"));
const asModule = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = async (path) =>
  ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
try {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const path = join(dir, "private.pem");
  await writeFile(path, await exportPKCS8(privateKey), { mode: 0o600 });
  Object.assign(process.env, {
    LTI_LMS_TYPE: "canvas",
    LTI_PLATFORM_URL: "https://canvas.test",
    LTI_ISSUER_URL: "https://canvas.instructure.com",
    LTI_CLIENT_ID: "client-123",
    LTI_PRIVATE_KEY_PATH: path,
    LTI_REDIRECT_URI: "https://tool.test/lti/launch",
  });
  const config = asModule(await compile("../src/lib/lti.ts"));
  const code = (await compile("../src/lib/lti-deep-link.ts"))
    .replace('"./lti"', JSON.stringify(config))
    .replace('"jose"', JSON.stringify(import.meta.resolve("jose")));
  const {
    deepLinkSettings,
    signDeepLinkResponse,
    deepLinkForm,
    LTI_CLAIM,
    DL_CLAIM,
  } = await import(asModule(code));
  const opaque = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"context_module_id":17,"placement":"module_menu_modal"}').toString("base64url")}.opaque`;
  const returnUrl = `https://canvas.test/courses/3/deep_linking_response?data=${opaque}`;
  const payload = {
    [`${LTI_CLAIM}deployment_id`]: "deployment-1",
    [`${DL_CLAIM}deep_linking_settings`]: {
      accept_types: ["ltiResourceLink"],
      deep_link_return_url: returnUrl,
      data: "opaque-data-123",
    },
  };
  const settings = deepLinkSettings(payload, "https://canvas.test");
  assert.equal(settings.moduleId, "17");
  assert.equal(settings.returnUrl, returnUrl);
  const malformed = (overrides) => ({
    ...payload,
    [`${DL_CLAIM}deep_linking_settings`]: {
      ...payload[`${DL_CLAIM}deep_linking_settings`],
      ...overrides,
    },
  });
  assert.throws(
    () =>
      deepLinkSettings(
        malformed({ deep_link_return_url: "https://evil.test/return" }),
        "https://canvas.test",
      ),
    /không thuộc/,
  );
  assert.throws(
    () =>
      deepLinkSettings(
        malformed({ accept_types: ["file"] }),
        "https://canvas.test",
      ),
    /không chấp nhận/,
  );
  assert.throws(
    () =>
      deepLinkSettings(
        malformed({ deep_link_return_url: "https://canvas.test/return" }),
        "https://canvas.test",
      ),
    /module/,
  );
  const state = {
    ...settings,
    userId: "user",
    courseId: "course",
    selectionId: "selection",
  };
  const token = await signDeepLinkResponse(state, {
    quiz_set_id: "set-123",
    title: "Quiz chương 1",
  });
  const { payload: response } = await jwtVerify(token, publicKey, {
    issuer: "client-123",
    audience: "https://canvas.instructure.com",
  });
  assert.equal(response[`${LTI_CLAIM}message_type`], "LtiDeepLinkingResponse");
  assert.equal(response[`${LTI_CLAIM}deployment_id`], "deployment-1");
  assert.equal(response[`${DL_CLAIM}data`], "opaque-data-123");
  const item = response[`${DL_CLAIM}content_items`][0];
  assert.equal(item.type, "ltiResourceLink");
  assert.equal(item.custom.target_kind, "quiz_set");
  assert.equal(item.custom.target_id, "set-123");
  assert.equal(item.lineItem.scoreMaximum, 100);
  assert.equal(item.url, "https://tool.test/learn/quizzes/set-123");
  assert.equal(item.custom.ags_score_maximum, "100");
  assert.equal(item.submission, undefined);
  const { payload: examResponse } = await jwtVerify(
    await signDeepLinkResponse(state, {
      quiz_set_id: "exam-1",
      title: "Kiểm tra chương 1",
      questionCount: 10,
      settings: {
        mode: "exam",
        pointsPossible: 10,
        maxAttempts: 1,
        timeLimitMinutes: 30,
        availableFrom: "2026-10-01T01:00:00.000Z",
        availableUntil: "2026-10-01T03:00:00.000Z",
        dueAt: "2026-10-01T02:30:00.000Z",
      },
    }),
    publicKey,
  );
  const exam = examResponse[`${DL_CLAIM}content_items`][0];
  // Canvas: lineItem.scoreMaximum → points, available → unlock/lock, submission.endDateTime → due.
  assert.equal(exam.lineItem.scoreMaximum, 10);
  assert.equal(exam.custom.ags_score_maximum, "10");
  assert.deepEqual(exam.available, {
    startDateTime: "2026-10-01T01:00:00.000Z",
    endDateTime: "2026-10-01T03:00:00.000Z",
  });
  assert.deepEqual(exam.submission, { endDateTime: "2026-10-01T02:30:00.000Z" });
  assert.match(exam.text, /Bài kiểm tra DA · 10 câu · 30 phút · 1 lần làm/);
  const { payload: cancel } = await jwtVerify(
    await signDeepLinkResponse(state),
    publicKey,
  );
  assert.deepEqual(cancel[`${DL_CLAIM}content_items`], []);
  const form = deepLinkForm(returnUrl + '&label="<script>"', token);
  assert.equal(form.headers.get("cache-control"), "no-store");
  const html = await form.text();
  assert.ok(html.includes('name="JWT"'));
  assert.ok(!html.includes('&label="<script>"'));
  console.log(
    "PASS: module context, return-origin validation, signed response, grade item, exam dates/points, cancellation, safe form",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
