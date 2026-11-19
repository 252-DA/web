import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";

// Source core-api để so route hai chiều. Mặc định là checkout cạnh web/;
// trong container web không có sẵn -> đặt CORE_API_SRC, nếu không phần so
// route sẽ bị bỏ qua (các phần JWT/lỗi/method vẫn chạy và vẫn fail nếu sai).
const CONTROLLER_DIR = process.env.CORE_API_SRC
  ? resolve(process.env.CORE_API_SRC)
  : fileURLToPath(new URL("../../core-api/src/", import.meta.url));

const asModule = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

async function collectCoreApiRoutes() {
  const routes = [];
  let entries;
  try {
    entries = await readdir(CONTROLLER_DIR, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".controller.ts")) continue;
    const fullPath = join(entry.parentPath || entry.path, entry.name);
    const text = await readFile(fullPath, "utf8");
    const ctrlMatch = text.match(/@Controller\(\s*(['"`])([^'"`]*)\1\s*\)/);
    if (!ctrlMatch) continue;
    const prefix = ctrlMatch[2].replace(/^\/+|\/+$/g, "");
    const decRegex = /@(Get|Post|Put|Patch|Delete)\(\s*(?:(['"`])([^'"`]*)\2)?\s*\)/g;
    let m;
    while ((m = decRegex.exec(text)) !== null) {
      const method = m[1].toUpperCase();
      const sub = (m[3] || "").replace(/^\/+|\/+$/g, "");
      const path = "/" + [prefix, sub].filter(Boolean).join("/");
      const pattern = new RegExp(
        "^" +
          path
            .split("/")
            .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
            .join("/") +
          "$",
      );
      routes.push({ method, path, pattern, file: entry.name });
    }
  }
  return routes;
}

const dir = await mkdtemp(join(tmpdir(), "da-core-api-test-"));
const originalFetch = globalThis.fetch;

try {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { extractable: true });
  const keyPath = join(dir, "bff-to-core.pem");
  await writeFile(keyPath, await exportPKCS8(privateKey), { mode: 0o600 });

  Object.assign(process.env, {
    BFF_TO_CORE_PRIVATE_KEY_PATH: keyPath,
    BFF_TO_CORE_KEY_ID: "bff-test-1",
    BFF_TO_CORE_JWT_ISSUER: "web-bff",
    BFF_TO_CORE_JWT_AUDIENCE: "core-api",
    CORE_API_INTERNAL_URL: "http://core-api.internal:4000/",
  });

  const joseUrl = import.meta.resolve("jose");
  const rawBffJwt = await readFile(new URL("../src/lib/bff-jwt.ts", import.meta.url), "utf8");
  const bffJwtSource = transpile(rawBffJwt.replace(/from ['"]jose['"]/g, `from ${JSON.stringify(joseUrl)}`));
  const bffJwtUrl = asModule(bffJwtSource);
  const rawCoreApi = await readFile(new URL("../src/lib/core-api.ts", import.meta.url), "utf8");
  const coreApiSource = transpile(rawCoreApi.replace('from "./bff-jwt"', `from ${JSON.stringify(bffJwtUrl)}`));
  const { coreApi, CoreApiError, coreApiErrorStatus, claimsFromSession } = await import(asModule(coreApiSource));

  const captured = [];
  let nextResponse = () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const rawBody = typeof init.body === "string" ? init.body : undefined;
    captured.push({
      origin: url.origin,
      method: init.method || "GET",
      pathname: url.pathname,
      searchParams: Object.fromEntries(url.searchParams.entries()),
      headers,
      cache: init.cache,
      signal: init.signal,
      body: rawBody ? JSON.parse(rawBody) : undefined,
    });
    return nextResponse();
  };

  const claims = claimsFromSession({
    internalUserId: "user-1",
    courseId: "course-1",
    role: "instructor",
    courseRole: "instructor",
    roles: ["ta"],
  });
  assert.deepEqual(claims, {
    sub: "user-1",
    courseId: "course-1",
    roles: ["instructor", "instructor", "ta"],
    scope: "course",
  });

  // Verify real EdDSA JWT minted, trailing slash stripped from CORE_API_INTERNAL_URL, cache/signal set
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  await coreApi.listCourses(claims);
  const firstReq = captured.pop();
  assert.equal(firstReq.origin, "http://core-api.internal:4000");
  assert.equal(firstReq.method, "GET");
  assert.equal(firstReq.pathname, "/api/courses");
  assert.equal(firstReq.headers["content-type"], undefined);
  assert.match(firstReq.headers["x-request-id"] || "", uuidRe);
  assert.equal(firstReq.cache, "no-store");
  assert.ok(firstReq.signal instanceof AbortSignal);
  assert.ok(firstReq.headers.authorization?.startsWith("Bearer "));
  const verified = await jwtVerify(firstReq.headers.authorization.slice(7), publicKey, {
    algorithms: ["EdDSA"],
    issuer: "web-bff",
    audience: "core-api",
  });
  assert.equal(verified.payload.sub, "user-1");
  assert.equal(verified.payload.courseId, "course-1");

  // Exercise every coreApi.* method and verify HTTP dispatch + core-api controller route parity
  const calls = [
    ["canvasQuizContext", [{ courseId: "c1", moduleId: "m1", chapterId: "ch1" }, claims], "GET", "/api/quiz-sets/canvas-context", { courseId: "c1", moduleId: "m1", chapterId: "ch1" }, undefined],
    ["createQuizSet", [{ courseId: "c1", title: "Q", quizIds: ["q1"], selectionId: "sel1" }, claims], "POST", "/api/quiz-sets", {}, { courseId: "c1", title: "Q", quizIds: ["q1"], selectionId: "sel1" }],
    ["getQuizSet", ["qs/1", claims, "rl-1"], "GET", "/api/quiz-sets/qs%2F1", { resourceLinkId: "rl-1" }, undefined],
    ["quizBuilderContext", [{ courseId: "c1", loIds: ["lo1"] }, claims], "POST", "/api/quiz-sets/builder-context", {}, { courseId: "c1", loIds: ["lo1"] }],
    ["startQuizSet", [{ quizSetId: "qs-1", resourceLinkId: "rl-1" }, claims], "POST", "/api/quiz-sets/qs-1/start", {}, { resourceLinkId: "rl-1" }],
    ["submitQuizSet", [{ quizSetId: "qs-1", resourceLinkId: "rl-1", answers: [], sessionId: "s1" }, claims], "POST", "/api/quiz-sets/qs-1/submit", {}, { resourceLinkId: "rl-1", answers: [], sessionId: "s1" }],
    ["quizSetResults", ["qs-1", claims, "rl-1"], "GET", "/api/quiz-sets/qs-1/results", { resourceLinkId: "rl-1" }, undefined],
    ["quizSubmission", ["qs-1", "sub-1", claims], "GET", "/api/quiz-sets/qs-1/submissions/sub-1", {}, undefined],
    ["launchSync", [{ lmsType: "canvas", lmsSub: "s1" }], "POST", "/api/lti/launch-sync", {}, { lmsType: "canvas", lmsSub: "s1" }],
    ["listCourses", [claims], "GET", "/api/courses", {}, undefined],
    ["getCourse", ["c1", claims], "GET", "/api/courses/c1", {}, undefined],
    ["listChapters", ["c1", claims], "GET", "/api/courses/c1/chapters", {}, undefined],
    ["listLearningOutcomes", ["c1", claims], "GET", "/api/courses/c1/learning-outcomes", {}, undefined],
    ["syncCurriculumFromCanvas", ["c1", claims], "POST", "/api/curriculum/sync-canvas", {}, { courseId: "c1" }],
    ["listCurriculumImports", [{ courseId: "c1", limit: 5 }, claims], "GET", "/api/curriculum/imports", { courseId: "c1", limit: "5" }, undefined],
    ["applyCurriculumImport", ["imp-1", claims], "POST", "/api/curriculum/imports/imp-1/apply", {}, undefined],
    ["createUploadSession", [{ courseId: "c1", title: "T", fileName: "a.pdf" }, claims], "POST", "/api/documents/upload-session", {}, { courseId: "c1", title: "T", fileName: "a.pdf" }],
    ["confirmUpload", ["d1", claims], "POST", "/api/documents/d1/confirm-upload", {}, undefined],
    ["listDocuments", [{ courseId: "c1", limit: 10, offset: 0 }, claims], "GET", "/api/documents", { courseId: "c1", limit: "10", offset: "0" }, undefined],
    ["getDocument", ["d1", claims], "GET", "/api/documents/d1", {}, undefined],
    ["getDocumentChunks", [{ documentId: "d1", page: 3 }, claims], "GET", "/api/documents/d1/chunks", { page: "3" }, undefined],
    ["getDocumentFileUrl", ["d1", claims], "GET", "/api/documents/d1/file-url", {}, undefined],
    ["deleteDocument", ["d1", claims], "DELETE", "/api/documents/d1", {}, undefined],
    ["syncDocumentsFromCanvas", ["c1", claims], "POST", "/api/documents/sync-canvas", {}, { courseId: "c1" }],
    ["getCanvasSyncStatus", ["c1", claims], "GET", "/api/documents/canvas-sync-status", { courseId: "c1" }, undefined],
    ["updateDocumentPlacement", ["d1", { role: "lecture", chapterCode: "CH1" }, claims], "PATCH", "/api/documents/d1/placement", {}, { role: "lecture", chapterCode: "CH1" }],
    ["listLessons", [{ courseId: "c1", status: "PUBLISHED" }, claims], "GET", "/api/lessons", { courseId: "c1", status: "PUBLISHED" }, undefined],
    ["getLesson", ["l1", claims], "GET", "/api/lessons/l1", {}, undefined],
    ["lessonCards", ["l1", claims], "GET", "/api/lessons/l1/cards", { status: "PUBLISHED" }, undefined],
    ["lessonQuiz", ["l1", claims, "DRAFT"], "GET", "/api/lessons/l1/quiz", { status: "DRAFT" }, undefined],
    ["publishLesson", ["l1", claims], "POST", "/api/lessons/l1/publish", {}, undefined],
    ["listReviewDrafts", [{ courseId: "c1", kind: "quiz", bankId: "b1" }, claims], "GET", "/api/review/drafts", { courseId: "c1", kind: "quiz", bankId: "b1" }, undefined],
    ["approveCard", ["card-1", claims], "POST", "/api/review/cards/card-1/approve", {}, undefined],
    ["rejectCard", ["card-1", "bad", claims], "POST", "/api/review/cards/card-1/reject", {}, { reason: "bad" }],
    ["updateCard", ["card-1", { front: "A" }, claims], "PATCH", "/api/review/cards/card-1", {}, { content: { front: "A" } }],
    ["approveQuizItem", ["q1", claims], "POST", "/api/review/quiz-items/q1/approve", {}, undefined],
    ["approveQuizItems", [["q1", "q2"], claims], "POST", "/api/review/quiz-items/approve-batch", {}, { quizIds: ["q1", "q2"] }],
    ["rejectQuizItem", ["q1", "dup", claims], "POST", "/api/review/quiz-items/q1/reject", {}, { reason: "dup" }],
    ["updateQuizItem", ["q1", { question: "Q?" }, claims], "PATCH", "/api/review/quiz-items/q1", {}, { question: "Q?" }],
    ["submitQuiz", [{ lessonId: "l1", answers: [] }, claims], "POST", "/api/quiz/submit", {}, { lessonId: "l1", answers: [] }],
    ["listQuizAttempts", ["l1", claims], "GET", "/api/quiz/attempts", { lessonId: "l1" }, undefined],
    ["listEssaysForReview", ["c1", claims], "GET", "/api/quiz/essays/review", { courseId: "c1" }, undefined],
    ["gradeEssayAnswer", [{ attemptId: "att-1", score: "9", feedback: "Good" }, claims], "POST", "/api/quiz/essays/att-1/grade", {}, { score: "9", feedback: "Good" }],
    ["retryEssayGrading", ["att-1", claims], "POST", "/api/quiz/essays/att-1/retry", {}, undefined],
    ["learnerSummary", [{ courseId: "c1", userId: "u2" }, claims], "GET", "/api/learning-agent/summary", { courseId: "c1", userId: "u2" }, undefined],
    ["courseMastery", ["c1", claims], "GET", "/api/learning-agent/course-mastery", { courseId: "c1" }, undefined],
    ["createContentGenerationRequest", [{ courseId: "c1", type: "quiz", scope: {} }, claims], "POST", "/api/content-generations", {}, { courseId: "c1", type: "quiz", scope: {} }],
    ["listContentGenerationRequests", [{ courseId: "c1", limit: 10, type: "micro_outline" }, claims], "GET", "/api/content-generations", { courseId: "c1", limit: "10", type: "micro_outline" }, undefined],
    ["listModelBindings", [claims], "GET", "/api/model-bindings", {}, undefined],
    ["setModelBinding", [{ task: "tutor", profile: null }, claims], "PUT", "/api/model-bindings", {}, { task: "tutor", profile: null }],
    ["getChatSettings", [claims], "GET", "/api/chat/settings", {}, undefined],
    ["setChatMode", [{ mode: "graph" }, claims], "PUT", "/api/chat/mode", {}, { mode: "graph" }],
    ["recordChatRun", [{ courseId: "c1", mode: "vector", question: "?" }, claims], "POST", "/api/chat/runs", {}, { courseId: "c1", mode: "vector", question: "?" }],
    ["rateChatRun", [{ runId: "r1", rating: 1 }, claims], "POST", "/api/chat/runs/r1/rate", {}, { rating: 1 }],
    ["getChatStats", [{ courseId: "c1", source: "web" }, claims], "GET", "/api/chat/stats", { courseId: "c1", source: "web" }, undefined],
    ["listChatConversations", [{ courseId: "c1" }, claims], "GET", "/api/chat/conversations", { courseId: "c1" }, undefined],
    ["getChatConversation", [{ courseId: "c1", conversationId: "cv1" }, claims], "GET", "/api/chat/conversations/detail", { courseId: "c1", conversationId: "cv1" }, undefined],
    ["deleteChatConversation", [{ courseId: "c1", conversationId: "cv1" }, claims], "DELETE", "/api/chat/conversations/cv1", { courseId: "c1" }, undefined],
    ["getChatCatalog", ["c1", claims], "GET", "/api/chat/catalog", { courseId: "c1" }, undefined],
    ["createEssayProcessor", [{ courseId: "c1", title: "E" }, claims], "POST", "/api/essay-processors", {}, { courseId: "c1", title: "E" }],
    ["updateEssayProcessor", [{ processorId: "p1", title: "E2" }, claims], "PATCH", "/api/essay-processors/p1", {}, { title: "E2" }],
    ["getEssayProcessor", ["p1", claims], "GET", "/api/essay-processors/p1", {}, undefined],
    ["receiveAssetNotices", [[{ notice_id: "n1" }]], "POST", "/api/essay-processors/notices", {}, { notices: [{ notice_id: "n1" }] }],
    ["getEssayReport", [{ submissionId: "s1", userSub: "u1" }, claims], "GET", "/api/essay-processors/report", { submissionId: "s1", userSub: "u1" }, undefined],
    ["listMicroContents", ["c1", claims], "GET", "/api/micro-content", { courseId: "c1" }, undefined],
    ["getMicroContent", ["mc1", claims], "GET", "/api/micro-content/mc1", {}, undefined],
    ["createMicroContent", [{ courseId: "c1", title: "MC" }, claims], "POST", "/api/micro-content", {}, { courseId: "c1", title: "MC" }],
    ["updateMicroContent", [{ microContentId: "mc1", title: "MC2" }, claims], "PATCH", "/api/micro-content/mc1", {}, { title: "MC2" }],
    ["deleteMicroContent", ["mc1", claims], "DELETE", "/api/micro-content/mc1", {}, undefined],
    ["publishMicroContent", ["mc1", claims], "POST", "/api/micro-content/mc1/publish", {}, {}],
    ["saveMicroContentQuestions", [{ microContentId: "mc1", questions: [] }, claims], "PUT", "/api/micro-content/mc1/questions", {}, { questions: [] }],
    ["createMicroContentUpload", ["mc1", "v.mp4", claims], "POST", "/api/micro-content/mc1/upload", {}, { filename: "v.mp4" }],
    ["confirmMicroContentUpload", ["mc1", claims], "POST", "/api/micro-content/mc1/upload/confirm", {}, undefined],
    ["getMicroContentVideoUrl", ["mc1", claims], "GET", "/api/micro-content/mc1/video-url", {}, undefined],
    ["getMicroContentSubtitles", ["mc1", claims], "GET", "/api/micro-content/mc1/subtitles", {}, undefined],
    ["requestMicroContentOutline", [{ courseId: "c1", documentId: "d1" }, claims], "POST", "/api/micro-content/outline", {}, { courseId: "c1", documentId: "d1" }],
    ["requestMicroContentScript", [{ microContentId: "mc1", tone: "concise" }, claims], "POST", "/api/micro-content/mc1/script", {}, { tone: "concise" }],
    ["saveMicroContentScript", [{ microContentId: "mc1", script: { scenes: [] } }, claims], "PUT", "/api/micro-content/mc1/script", {}, { script: { scenes: [] } }],
    ["requestMicroContentRender", ["mc1", claims, true], "POST", "/api/micro-content/mc1/render", {}, { allowFlagged: true }],
    ["requestMicroContentQuiz", [{ microContentId: "mc1", count: 3 }, claims], "POST", "/api/micro-content/mc1/quiz", {}, { count: 3 }],
    ["reportMicroContentProgress", [{ microContentId: "mc1", positionMs: 5000 }, claims], "POST", "/api/micro-content/mc1/progress", {}, { positionMs: 5000 }],
    ["submitMicroContent", [{ microContentId: "mc1", answers: [] }, claims], "POST", "/api/micro-content/mc1/submit", {}, { answers: [] }],
    ["getMicroContentResult", ["att1", claims], "GET", "/api/micro-content/attempts/att1/result", {}, undefined],
    ["listMicroContentAttempts", ["mc1", claims], "GET", "/api/micro-content/mc1/attempts", {}, undefined],
    ["listVideoAssets", [{ scope: "course", courseId: "c1", limit: 20, offset: 0 }, claims], "GET", "/api/video-assets", { scope: "course", courseId: "c1", limit: "20", offset: "0" }, undefined],
    ["getVideoAsset", ["va1", claims], "GET", "/api/video-assets/va1", {}, undefined],
    ["createVideoAssetUpload", [{ title: "V", filename: "a.mp4" }, claims], "POST", "/api/video-assets/upload", {}, { title: "V", filename: "a.mp4" }],
    ["confirmVideoAssetUpload", [{ assetId: "va1", sizeBytes: 123 }, claims], "POST", "/api/video-assets/va1/confirm-upload", {}, { sizeBytes: 123 }],
    ["getVideoAssetUrl", [{ assetId: "va1", microContentId: "mc1" }, claims], "GET", "/api/video-assets/va1/stream-url", { microContentId: "mc1" }, undefined],
    ["updateVideoAsset", [{ assetId: "va1", visibility: "PUBLIC" }, claims], "PATCH", "/api/video-assets/va1", {}, { visibility: "PUBLIC" }],
    ["deleteVideoAsset", ["va1", claims], "DELETE", "/api/video-assets/va1", {}, undefined],
    ["forkVideoAsset", [{ assetId: "va1", targetCourseId: "c2" }, claims], "POST", "/api/video-assets/va1/fork", {}, { targetCourseId: "c2" }],
    ["checkVideoAssetHash", ["sha256", claims], "POST", "/api/video-assets/check-hash", {}, { fileHash: "sha256" }],
    ["attachVideoAssetToMicroContent", [{ microContentId: "mc1", assetId: null }, claims], "POST", "/api/video-assets/attach", {}, { microContentId: "mc1", assetId: null }],
    ["listQuestionBanks", [{ courseId: "c1" }, claims], "GET", "/api/question-banks", { courseId: "c1" }, undefined],
    ["createQuestionBank", [{ courseId: "c1", title: "Bank 1", visibility: "COURSE" }, claims], "POST", "/api/question-banks", {}, { courseId: "c1", title: "Bank 1", visibility: "COURSE" }],
    ["updateQuestionBank", [{ bankId: "b1", title: "Bank 2" }, claims], "PATCH", "/api/question-banks/b1", {}, { title: "Bank 2" }],
    ["listQuestionBankItems", [{ bankId: "b1", lo: "L.O.1", type: "MCQ_SINGLE", status: "APPROVED", origin: "MANUAL", search: "abc" }, claims], "GET", "/api/question-banks/b1/items", { lo: "L.O.1", type: "MCQ_SINGLE", status: "APPROVED", origin: "MANUAL", search: "abc" }, undefined],
    ["createQuestionBankItem", [{ bankId: "b1", type: "MCQ_SINGLE", question: "Q?", options: ["A", "B", "C", "D"], correct_answer: "A" }, claims], "POST", "/api/question-banks/b1/items", {}, { type: "MCQ_SINGLE", question: "Q?", options: ["A", "B", "C", "D"], correct_answer: "A" }],
    ["shareQuestionBank", [{ bankId: "b1", granteeType: "USER", granteeId: "u2", role: "USE" }, claims], "POST", "/api/question-banks/b1/shares", {}, { granteeType: "USER", granteeId: "u2", role: "USE" }],
    ["unshareQuestionBank", [{ bankId: "b1", granteeType: "USER", granteeId: "u2" }, claims], "DELETE", "/api/question-banks/b1/shares", { granteeType: "USER", granteeId: "u2" }, undefined],
    ["retireQuestionBankItem", [{ bankId: "b1", quizId: "q1", restore: true }, claims], "POST", "/api/question-banks/b1/items/q1/retire", {}, { restore: true }],
    ["listQuizItemVersions", ["q1", claims], "GET", "/api/quiz-items/q1/versions", {}, undefined],
  ];

  // Assert every exported method on coreApi is tested
  assert.deepEqual(
    calls.map((c) => c[0]).sort(),
    Object.keys(coreApi).sort(),
    "Every method on coreApi must be covered by route test table",
  );

  const coreApiRoutes = await collectCoreApiRoutes();
  if (coreApiRoutes === null) {
    console.log(
      `SKIP: không thấy source core-api tại ${CONTROLLER_DIR} (đặt CORE_API_SRC trỏ tới core-api/src); bỏ qua phần so route hai chiều.`,
    );
  }
  const seenRequestIds = new Set();
  for (const [fn, args, expectedMethod, expectedPath, expectedQuery, expectedBody] of calls) {
    captured.length = 0;
    await coreApi[fn](...args);
    assert.equal(captured.length, 1, `${fn} should issue exactly 1 HTTP request`);
    const req = captured[0];
    assert.equal(req.method, expectedMethod, `${fn} HTTP method`);
    assert.equal(req.pathname, expectedPath, `${fn} path`);
    assert.deepEqual(req.searchParams, expectedQuery, `${fn} query params`);
    assert.deepEqual(req.body, expectedBody, `${fn} JSON body`);
    const reqId = req.headers["x-request-id"];
    assert.match(reqId || "", uuidRe, `${fn} x-request-id must be a valid UUID`);
    assert.ok(!seenRequestIds.has(reqId), `${fn} x-request-id must be unique per call`);
    seenRequestIds.add(reqId);
    if (expectedBody === undefined) {
      assert.equal(req.headers["content-type"], undefined, `${fn} should omit content-type when no body`);
    }
    if (coreApiRoutes) {
      const matchedRoute = coreApiRoutes.find(
        (r) => r.method === expectedMethod && r.pattern.test(expectedPath),
      );
      assert.ok(matchedRoute, `${fn} (${expectedMethod} ${expectedPath}) has matching core-api controller route`);
    }
  }

  // Chiều ngược: mọi route trong *.controller.ts phải được ít nhất một method
  // của coreApi gọi tới (không còn route thừa phía core-api).
  if (coreApiRoutes) {
    const uncalled = coreApiRoutes.filter(
      (r) => !calls.some(([, , method, path]) => method === r.method && r.pattern.test(path)),
    );
    assert.deepEqual(
      uncalled.map((r) => `${r.method} ${r.path} (${r.file})`),
      [],
      "Mọi route controller của core-api phải được coreApi gọi tới",
    );
  }

  // Verify special system claims for launchSync and receiveAssetNotices
  captured.length = 0;
  await coreApi.launchSync({ test: 1 });
  const launchJwt = await jwtVerify(captured[0].headers.authorization.slice(7), publicKey, { algorithms: ["EdDSA"] });
  assert.equal(launchJwt.payload.sub, "lti-bootstrap");
  assert.equal(launchJwt.payload.scope, "admin");

  captured.length = 0;
  await coreApi.receiveAssetNotices([]);
  const noticeJwt = await jwtVerify(captured[0].headers.authorization.slice(7), publicKey, { algorithms: ["EdDSA"] });
  assert.equal(noticeJwt.payload.sub, "lti-notice");
  assert.equal(noticeJwt.payload.scope, "admin");

  // Error extraction: ValidationPipe array message, single string message, empty response, invalid JSON, 5xx & network failure
  nextResponse = () =>
    new Response(
      JSON.stringify({ statusCode: 400, message: ["courseId must be a string", "title should not be empty"] }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  await assert.rejects(
    () => coreApi.listCourses(claims),
    (err) => err instanceof CoreApiError && err.status === 400 && err.message === "courseId must be a string; title should not be empty" && coreApiErrorStatus(err) === 400 && uuidRe.test(err.requestId || ""),
  );

  nextResponse = () =>
    new Response(
      JSON.stringify({ statusCode: 403, message: "Forbidden course access" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  await assert.rejects(
    () => coreApi.getCourse("c1", claims),
    (err) => err instanceof CoreApiError && err.status === 403 && err.message === "Forbidden course access" && coreApiErrorStatus(err) === 403,
  );

  nextResponse = () =>
    new Response(
      JSON.stringify({ statusCode: 500, error: "Internal Server Error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  await assert.rejects(
    () => coreApi.getCourse("c1", claims),
    (err) => err instanceof CoreApiError && err.status === 500 && coreApiErrorStatus(err, 400) === 502,
  );

  nextResponse = () => new Response(null, { status: 204 });
  assert.equal(await coreApi.deleteDocument("d1", claims), null);

  nextResponse = () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } });
  await assert.rejects(
    () => coreApi.getCourse("c1", claims),
    (err) => err instanceof CoreApiError && err.status === 502 && coreApiErrorStatus(err, 500) === 502,
  );

  assert.equal(coreApiErrorStatus(new CoreApiError(404, "Not found"), 500), 404);
  assert.equal(coreApiErrorStatus(new CoreApiError(409, "Conflict"), 500), 409);
  assert.equal(coreApiErrorStatus(new Error("boom"), 500), 500);
  assert.equal(coreApiErrorStatus(new Error("boom"), 400), 400);

  // Simulate fetch network/timeout failure -> CoreApiError(502)
  nextResponse = () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  };
  await assert.rejects(
    () => coreApi.listCourses(claims),
    (err) => err instanceof CoreApiError && err.status === 502 && coreApiErrorStatus(err, 500) === 502 && uuidRe.test(err.requestId || ""),
  );

  console.log(
    coreApiRoutes
      ? `PASS: ${calls.length} coreApi HTTP methods, JWT claims, error mapping, so route hai chiều với ${coreApiRoutes.length} controller route.`
      : `PASS: ${calls.length} coreApi HTTP methods, JWT claims, error mapping (đã bỏ qua so route).`,
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(dir, { recursive: true, force: true });
}
