import { randomUUID } from "node:crypto";
import { mintCoreJwt, type BffClaims } from "./bff-jwt";
import type { LtiSession } from "./session";

const DEFAULT_TIMEOUT_MS = 30_000;
const MEDIUM_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = 120_000;

export class CoreApiError extends Error {
  status: number;
  body: unknown;
  requestId?: string;

  constructor(status: number, body: unknown, requestId?: string) {
    super(typeof body === "string" ? body : `Core API Error: ${status}`);
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

/**
 * Quy đổi lỗi từ core-api sang mã HTTP trả cho trình duyệt:
 * giữ nguyên 4xx nghiệp vụ/validation, gộp lỗi 5xx/mạng/timeout thành 502.
 */
export function coreApiErrorStatus(error: unknown, fallback = 502): number {
  if (!(error instanceof CoreApiError)) {
    return fallback;
  }
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

export function claimsFromSession(session: LtiSession): BffClaims {
  return {
    sub: session.internalUserId,
    courseId: session.courseId || undefined,
    roles: [session.courseRole, session.role, ...session.roles].filter(Boolean),
    scope: "course",
  };
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type JsonRecord = Record<string, unknown>;
type QueryValue = string | number | boolean | null | undefined;

type RequestOptions = {
  body?: unknown;
  timeoutMs?: number;
};

function getCoreApiUrl(): string {
  return (process.env.CORE_API_INTERNAL_URL || "http://core-api:4000").replace(/\/+$/, "");
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function asObj(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function splitId(body: unknown, key: string): { id: string; rest: JsonRecord } {
  const obj = asObj(body);
  const rawId = obj[key];
  const rest: JsonRecord = { ...obj };
  delete rest[key];
  return {
    id: typeof rawId === "string" ? rawId : "",
    rest,
  };
}

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

function extractErrorMessage(rawText: string, statusText: string, status: number): string {
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as { message?: unknown; error?: unknown };
      if (Array.isArray(parsed?.message)) {
        const joined = parsed.message.filter((item) => typeof item === "string").join("; ");
        if (joined) return joined;
      } else if (typeof parsed?.message === "string" && parsed.message) {
        return parsed.message;
      } else if (typeof parsed?.error === "string" && parsed.error) {
        return parsed.error;
      }
    } catch {
      return rawText;
    }
    return rawText;
  }
  return statusText || `Core API HTTP ${status}`;
}

async function requestCore<TResponse>(
  method: HttpMethod,
  path: string,
  claims: BffClaims,
  options: RequestOptions = {},
): Promise<TResponse> {
  const token = await mintCoreJwt(claims);
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "x-request-id": requestId,
  };

  const hasBody = options.body !== undefined;
  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${getCoreApiUrl()}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      // BFF luôn lấy dữ liệu mới nhất theo session LTI, không cache/memoize giữa các request.
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CoreApiError(502, `Core API request failed (${method} ${path}): ${message}`, requestId);
  }

  const responseRequestId = response.headers.get("x-request-id") || requestId;
  const text = await response.text();
  if (!response.ok) {
    throw new CoreApiError(
      response.status,
      extractErrorMessage(text, response.statusText, response.status),
      responseRequestId,
    );
  }

  if (!text) {
    return null as TResponse;
  }

  try {
    return JSON.parse(text) as TResponse;
  } catch {
    throw new CoreApiError(502, `Core API returned invalid JSON (${method} ${path})`, responseRequestId);
  }
}

const getCore = <T>(path: string, claims: BffClaims, timeoutMs?: number) =>
  requestCore<T>("GET", path, claims, { timeoutMs });

const postCore = <T>(path: string, claims: BffClaims, body?: unknown, timeoutMs?: number) =>
  requestCore<T>("POST", path, claims, { body, timeoutMs });

const putCore = <T>(path: string, claims: BffClaims, body?: unknown, timeoutMs?: number) =>
  requestCore<T>("PUT", path, claims, { body, timeoutMs });

const patchCore = <T>(path: string, claims: BffClaims, body?: unknown, timeoutMs?: number) =>
  requestCore<T>("PATCH", path, claims, { body, timeoutMs });

const deleteCore = <T>(path: string, claims: BffClaims, timeoutMs?: number) =>
  requestCore<T>("DELETE", path, claims, { timeoutMs });

export const coreApi = {
  canvasQuizContext: <T = unknown>(body: unknown, claims: BffClaims) => {
    const q = asObj(body);
    return getCore<T>(
      withQuery("/api/quiz-sets/canvas-context", {
        courseId: q.courseId as QueryValue,
        moduleId: q.moduleId as QueryValue,
        chapterId: q.chapterId as QueryValue,
      }),
      claims,
      LONG_TIMEOUT_MS,
    );
  },
  createQuizSet: <T = unknown>(body: unknown, claims: BffClaims) =>
    postCore<T>("/api/quiz-sets", claims, body),
  // resourceLinkId: bài tập Canvas đang mở, để cài đặt (điểm, hạn, số lần làm) theo Canvas.
  getQuizSet: <T = unknown>(quizSetId: string, claims: BffClaims, resourceLinkId?: string) =>
    getCore<T>(withQuery(`/api/quiz-sets/${enc(quizSetId)}`, { resourceLinkId }), claims),
  quizBuilderContext: <T = unknown>(body: { courseId: string; loIds?: string[] }, claims: BffClaims) =>
    postCore<T>("/api/quiz-sets/builder-context", claims, body),
  startQuizSet: <T = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "quizSetId");
    return postCore<T>(`/api/quiz-sets/${enc(id)}/start`, claims, rest);
  },
  submitQuizSet: <T = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "quizSetId");
    return postCore<T>(`/api/quiz-sets/${enc(id)}/submit`, claims, rest);
  },
  quizSetResults: <T = unknown>(quizSetId: string, claims: BffClaims, resourceLinkId?: string) =>
    getCore<T>(withQuery(`/api/quiz-sets/${enc(quizSetId)}/results`, { resourceLinkId }), claims),
  quizSubmission: <T = unknown>(quizSetId: string, submissionId: string, claims: BffClaims) =>
    getCore<T>(`/api/quiz-sets/${enc(quizSetId)}/submissions/${enc(submissionId)}`, claims),
  launchSync: <TResponse = unknown>(body: unknown) =>
    postCore<TResponse>(
      "/api/lti/launch-sync",
      {
        sub: "lti-bootstrap",
        roles: ["system"],
        scope: "admin",
      },
      body,
      // LtiService.seedAttempts đẩy số lần làm sang Canvas đồng bộ
      // (CanvasApiClient.setAssignmentAllowedAttempts, WRITE_TIMEOUT_MS = 5s)
      // sau khi giao dịch launch commit — MEDIUM là đủ dư.
      MEDIUM_TIMEOUT_MS,
    ),
  listCourses: <TResponse = unknown>(claims: BffClaims) =>
    getCore<TResponse>("/api/courses", claims),
  getCourse: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/courses/${enc(courseId)}`, claims),
  listChapters: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/courses/${enc(courseId)}/chapters`, claims),
  listLearningOutcomes: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/courses/${enc(courseId)}/learning-outcomes`, claims),
  syncCurriculumFromCanvas: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    postCore<TResponse>("/api/curriculum/sync-canvas", claims, { courseId }, LONG_TIMEOUT_MS),
  listCurriculumImports: <TResponse = unknown>(
    body: { courseId: string; limit?: number },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/curriculum/imports", {
        courseId: body.courseId,
        limit: body.limit,
      }),
      claims,
    ),
  applyCurriculumImport: <TResponse = unknown>(importId: string, claims: BffClaims) =>
    postCore<TResponse>(
      `/api/curriculum/imports/${enc(importId)}/apply`,
      claims,
      undefined,
      MEDIUM_TIMEOUT_MS,
    ),
  createUploadSession: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/documents/upload-session", claims, body),
  confirmUpload: <TResponse = unknown>(documentId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/documents/${enc(documentId)}/confirm-upload`, claims),
  listDocuments: <TResponse = unknown>(
    body: { courseId: string; limit?: number; offset?: number },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/documents", {
        courseId: body.courseId,
        limit: body.limit,
        offset: body.offset,
      }),
      claims,
    ),
  getDocument: <TResponse = unknown>(documentId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/documents/${enc(documentId)}`, claims),
  // page bỏ trống = cả tài liệu; có page = đúng một trang.
  getDocumentChunks: <TResponse = unknown>(
    body: { documentId: string; page?: number },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery(`/api/documents/${enc(body.documentId)}/chunks`, { page: body.page }),
      claims,
    ),
  getDocumentFileUrl: <TResponse = unknown>(documentId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/documents/${enc(documentId)}/file-url`, claims),
  deleteDocument: <TResponse = unknown>(documentId: string, claims: BffClaims) =>
    deleteCore<TResponse>(`/api/documents/${enc(documentId)}`, claims),
  syncDocumentsFromCanvas: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    postCore<TResponse>("/api/documents/sync-canvas", claims, { courseId }, LONG_TIMEOUT_MS),
  getCanvasSyncStatus: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(
      withQuery("/api/documents/canvas-sync-status", { courseId }),
      claims,
    ),
  updateDocumentPlacement: <TResponse = unknown>(
    documentId: string,
    placement: { role?: string; chapterCode?: string },
    claims: BffClaims,
  ) => patchCore<TResponse>(`/api/documents/${enc(documentId)}/placement`, claims, placement),
  listLessons: <TResponse = unknown>(
    body: { courseId: string; status?: string },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/lessons", { courseId: body.courseId, status: body.status }),
      claims,
    ),
  getLesson: <TResponse = unknown>(lessonId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/lessons/${enc(lessonId)}`, claims),
  lessonCards: <TResponse = unknown>(
    lessonId: string,
    claims: BffClaims,
    status = "PUBLISHED",
  ) =>
    getCore<TResponse>(
      withQuery(`/api/lessons/${enc(lessonId)}/cards`, { status }),
      claims,
    ),
  lessonQuiz: <TResponse = unknown>(
    lessonId: string,
    claims: BffClaims,
    status = "PUBLISHED",
  ) =>
    getCore<TResponse>(
      withQuery(`/api/lessons/${enc(lessonId)}/quiz`, { status }),
      claims,
    ),
  publishLesson: <TResponse = unknown>(lessonId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/lessons/${enc(lessonId)}/publish`, claims),
  listReviewDrafts: <TResponse = unknown>(
    body: { courseId: string; kind?: "card" | "quiz"; bankId?: string },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/review/drafts", {
        courseId: body.courseId,
        kind: body.kind,
        bankId: body.bankId,
      }),
      claims,
    ),
  approveCard: <TResponse = unknown>(cardId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/review/cards/${enc(cardId)}/approve`, claims),
  rejectCard: <TResponse = unknown>(cardId: string, reason: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/review/cards/${enc(cardId)}/reject`, claims, { reason }),
  updateCard: <TResponse = unknown>(cardId: string, content: unknown, claims: BffClaims) =>
    patchCore<TResponse>(`/api/review/cards/${enc(cardId)}`, claims, { content }),
  approveQuizItem: <TResponse = unknown>(quizId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/review/quiz-items/${enc(quizId)}/approve`, claims),
  approveQuizItems: <TResponse = { approved: number }>(quizIds: string[], claims: BffClaims) =>
    postCore<TResponse>("/api/review/quiz-items/approve-batch", claims, { quizIds }),
  rejectQuizItem: <TResponse = unknown>(quizId: string, reason: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/review/quiz-items/${enc(quizId)}/reject`, claims, { reason }),
  updateQuizItem: <TResponse = unknown>(quizId: string, data: unknown, claims: BffClaims) =>
    patchCore<TResponse>(`/api/review/quiz-items/${enc(quizId)}`, claims, data),
  submitQuiz: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/quiz/submit", claims, body),
  listQuizAttempts: <TResponse = unknown>(lessonId: string, claims: BffClaims) =>
    getCore<TResponse>(withQuery("/api/quiz/attempts", { lessonId }), claims),
  listEssaysForReview: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(withQuery("/api/quiz/essays/review", { courseId }), claims),
  gradeEssayAnswer: <TResponse = unknown>(
    body: { attemptId: string; score: string; feedback?: string },
    claims: BffClaims,
  ) =>
    postCore<TResponse>(
      `/api/quiz/essays/${enc(body.attemptId)}/grade`,
      claims,
      { score: body.score, feedback: body.feedback },
    ),
  retryEssayGrading: <TResponse = unknown>(attemptId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/quiz/essays/${enc(attemptId)}/retry`, claims),
  learnerSummary: <TResponse = unknown>(body: { courseId: string; userId?: string }, claims: BffClaims) =>
    getCore<TResponse>(
      withQuery("/api/learning-agent/summary", {
        courseId: body.courseId,
        userId: body.userId,
      }),
      claims,
    ),
  courseMastery: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(
      withQuery("/api/learning-agent/course-mastery", { courseId }),
      claims,
    ),
  createContentGenerationRequest: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/content-generations", claims, body),
  listContentGenerationRequests: <TResponse = unknown>(
    body: {
      courseId: string;
      limit?: number;
      type?: "card" | "quiz" | "relations" | "micro_outline" | "video_script" | "micro_quiz";
    },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/content-generations", {
        courseId: body.courseId,
        limit: body.limit,
        type: body.type,
      }),
      claims,
    ),
  // Chọn model AI theo task — chỉ admin; core-api kiểm tra quyền và tên profile.
  listModelBindings: <TResponse = unknown>(claims: BffClaims) =>
    getCore<TResponse>("/api/model-bindings", claims),
  setModelBinding: <TResponse = unknown>(
    body: { task: string; profile: string | null },
    claims: BffClaims,
  ) => putCore<TResponse>("/api/model-bindings", claims, body),
  // Chatbot ba chế độ truy xuất (docs/chatbot-ba-che-do-ke-hoach.md).
  getChatSettings: <TResponse = unknown>(claims: BffClaims) =>
    getCore<TResponse>("/api/chat/settings", claims),
  setChatMode: <TResponse = unknown>(body: { mode: string }, claims: BffClaims) =>
    putCore<TResponse>("/api/chat/mode", claims, body),
  recordChatRun: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/chat/runs", claims, body),
  rateChatRun: <TResponse = unknown>(body: { runId: string; rating: number }, claims: BffClaims) =>
    postCore<TResponse>(`/api/chat/runs/${enc(body.runId)}/rate`, claims, {
      rating: body.rating,
    }),
  getChatStats: <TResponse = unknown>(
    body: { courseId?: string; source?: "web" | "eval" },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/chat/stats", { courseId: body.courseId, source: body.source }),
      claims,
    ),
  listChatConversations: <TResponse = unknown>(
    body: { courseId: string },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(withQuery("/api/chat/conversations", { courseId: body.courseId }), claims),
  getChatConversation: <TResponse = unknown>(
    body: { courseId: string; conversationId?: string },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/chat/conversations/detail", {
        courseId: body.courseId,
        conversationId: body.conversationId,
      }),
      claims,
    ),
  deleteChatConversation: <TResponse = unknown>(
    body: { courseId: string; conversationId: string },
    claims: BffClaims,
  ) =>
    deleteCore<TResponse>(
      withQuery(`/api/chat/conversations/${enc(body.conversationId)}`, {
        courseId: body.courseId,
      }),
      claims,
    ),
  getChatCatalog: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(withQuery("/api/chat/catalog", { courseId }), claims),
  // Chấm bài luận nộp file qua LTI Asset Processor (docs/essay-asset-processor.md).
  // POST /api/essay-processors gọi Canvas đồng bộ: LtiServicesClient.registerNoticeHandler
  // xin token LTI rồi PUT Platform Notification Service (timeout 60s mỗi nhịp, thử lại
  // 1 lần khi 401) — web phải chờ lâu hơn tổng timeout đó.
  createEssayProcessor: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/essay-processors", claims, body, LONG_TIMEOUT_MS),
  updateEssayProcessor: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "processorId");
    return patchCore<TResponse>(`/api/essay-processors/${enc(id)}`, claims, rest);
  },
  getEssayProcessor: <TResponse = unknown>(processorId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/essay-processors/${enc(processorId)}`, claims),
  // Thông báo của Canvas không có phiên người dùng: web chuyển đi bằng danh
  // tính hệ thống mà core-api chỉ chấp nhận cho endpoint này.
  receiveAssetNotices: <TResponse = unknown>(notices: unknown[]) =>
    postCore<TResponse>(
      "/api/essay-processors/notices",
      {
        sub: "lti-notice",
        roles: ["system"],
        scope: "admin",
      },
      { notices },
    ),
  getEssayReport: <TResponse = unknown>(
    body: { submissionId: string; userSub: string },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/essay-processors/report", {
        submissionId: body.submissionId,
        userSub: body.userSub,
      }),
      claims,
    ),
  listMicroContents: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(withQuery("/api/micro-content", { courseId }), claims),
  getMicroContent: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/micro-content/${enc(microContentId)}`, claims),
  createMicroContent: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/micro-content", claims, body),
  updateMicroContent: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "microContentId");
    return patchCore<TResponse>(`/api/micro-content/${enc(id)}`, claims, rest);
  },
  deleteMicroContent: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    deleteCore<TResponse>(`/api/micro-content/${enc(microContentId)}`, claims),
  publishMicroContent: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/micro-content/${enc(microContentId)}/publish`, claims, {}),
  saveMicroContentQuestions: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "microContentId");
    return putCore<TResponse>(`/api/micro-content/${enc(id)}/questions`, claims, rest);
  },
  createMicroContentUpload: <TResponse = unknown>(microContentId: string, filename: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/micro-content/${enc(microContentId)}/upload`, claims, { filename }),
  confirmMicroContentUpload: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    postCore<TResponse>(`/api/micro-content/${enc(microContentId)}/upload/confirm`, claims),
  getMicroContentVideoUrl: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/micro-content/${enc(microContentId)}/video-url`, claims),
  getMicroContentSubtitles: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/micro-content/${enc(microContentId)}/subtitles`, claims),
  requestMicroContentOutline: <TResponse = unknown>(
    body: { courseId: string; documentId: string },
    claims: BffClaims,
  ) => postCore<TResponse>("/api/micro-content/outline", claims, body),
  requestMicroContentScript: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "microContentId");
    return postCore<TResponse>(`/api/micro-content/${enc(id)}/script`, claims, rest);
  },
  saveMicroContentScript: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "microContentId");
    return putCore<TResponse>(`/api/micro-content/${enc(id)}/script`, claims, rest);
  },
  requestMicroContentRender: <TResponse = unknown>(
    microContentId: string,
    claims: BffClaims,
    allowFlagged?: boolean,
  ) =>
    postCore<TResponse>(
      `/api/micro-content/${enc(microContentId)}/render`,
      claims,
      allowFlagged ? { allowFlagged: true } : {},
    ),
  requestMicroContentQuiz: <TResponse = unknown>(
    body: { microContentId: string; count?: number; questionTypes?: string[] },
    claims: BffClaims,
  ) => {
    const { microContentId, ...rest } = body;
    return postCore<TResponse>(`/api/micro-content/${enc(microContentId)}/quiz`, claims, rest);
  },
  reportMicroContentProgress: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "microContentId");
    return postCore<TResponse>(`/api/micro-content/${enc(id)}/progress`, claims, rest);
  },
  submitMicroContent: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "microContentId");
    return postCore<TResponse>(`/api/micro-content/${enc(id)}/submit`, claims, rest);
  },
  getMicroContentResult: <TResponse = unknown>(attemptId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/micro-content/attempts/${enc(attemptId)}/result`, claims),
  listMicroContentAttempts: <TResponse = unknown>(microContentId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/micro-content/${enc(microContentId)}/attempts`, claims),
  listVideoAssets: <TResponse = unknown>(params: unknown, claims: BffClaims) => {
    const q = asObj(params);
    return getCore<TResponse>(
      withQuery("/api/video-assets", {
        scope: q.scope as QueryValue,
        courseId: q.courseId as QueryValue,
        sourceType: q.sourceType as QueryValue,
        search: q.search as QueryValue,
        limit: q.limit as QueryValue,
        offset: q.offset as QueryValue,
      }),
      claims,
    );
  },
  getVideoAsset: <TResponse = unknown>(assetId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/video-assets/${enc(assetId)}`, claims),
  createVideoAssetUpload: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/video-assets/upload", claims, body),
  confirmVideoAssetUpload: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "assetId");
    return postCore<TResponse>(`/api/video-assets/${enc(id)}/confirm-upload`, claims, rest);
  },
  getVideoAssetUrl: <TResponse = unknown>(body: { assetId: string; microContentId?: string }, claims: BffClaims) =>
    getCore<TResponse>(
      withQuery(`/api/video-assets/${enc(body.assetId)}/stream-url`, {
        microContentId: body.microContentId,
      }),
      claims,
    ),
  updateVideoAsset: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "assetId");
    return patchCore<TResponse>(`/api/video-assets/${enc(id)}`, claims, rest);
  },
  deleteVideoAsset: <TResponse = unknown>(assetId: string, claims: BffClaims) =>
    deleteCore<TResponse>(`/api/video-assets/${enc(assetId)}`, claims),
  forkVideoAsset: <TResponse = unknown>(body: { assetId: string; targetCourseId?: string }, claims: BffClaims) => {
    const { assetId, ...rest } = body;
    return postCore<TResponse>(`/api/video-assets/${enc(assetId)}/fork`, claims, rest);
  },
  checkVideoAssetHash: <TResponse = unknown>(fileHash: string, claims: BffClaims) =>
    postCore<TResponse>("/api/video-assets/check-hash", claims, { fileHash }),
  attachVideoAssetToMicroContent: <TResponse = unknown>(
    body: { microContentId: string; assetId: string | null },
    claims: BffClaims,
  ) => postCore<TResponse>("/api/video-assets/attach", claims, body),
  listQuestionBanks: <TResponse = unknown>(
    body: { courseId?: string } | undefined,
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery("/api/question-banks", { courseId: body?.courseId }),
      claims,
    ),
  createQuestionBank: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    postCore<TResponse>("/api/question-banks", claims, body),
  updateQuestionBank: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "bankId");
    return patchCore<TResponse>(`/api/question-banks/${enc(id)}`, claims, rest);
  },
  listQuestionBankItems: <TResponse = unknown>(
    body: {
      bankId: string;
      lo?: string;
      type?: string;
      status?: string;
      origin?: string;
      search?: string;
    },
    claims: BffClaims,
  ) =>
    getCore<TResponse>(
      withQuery(`/api/question-banks/${enc(body.bankId)}/items`, {
        lo: body.lo,
        type: body.type,
        status: body.status,
        origin: body.origin,
        search: body.search,
      }),
      claims,
    ),
  createQuestionBankItem: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "bankId");
    return postCore<TResponse>(`/api/question-banks/${enc(id)}/items`, claims, rest);
  },
  shareQuestionBank: <TResponse = unknown>(body: unknown, claims: BffClaims) => {
    const { id, rest } = splitId(body, "bankId");
    return postCore<TResponse>(`/api/question-banks/${enc(id)}/shares`, claims, rest);
  },
  listQuestionBankShareCandidates: <TResponse = unknown>(bankId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/question-banks/${enc(bankId)}/share-candidates`, claims),
  unshareQuestionBank: <TResponse = unknown>(
    body: { bankId: string; granteeType: string; granteeId: string },
    claims: BffClaims,
  ) =>
    deleteCore<TResponse>(
      withQuery(`/api/question-banks/${enc(body.bankId)}/shares`, {
        granteeType: body.granteeType,
        granteeId: body.granteeId,
      }),
      claims,
    ),
  forkQuestionBankItem: <TResponse = unknown>(
    body: { bankId: string; quizId: string; targetBankId: string },
    claims: BffClaims,
  ) =>
    postCore<TResponse>(
      `/api/question-banks/${enc(body.bankId)}/items/${enc(body.quizId)}/fork`,
      claims,
      { targetBankId: body.targetBankId },
    ),
  retireQuestionBankItem: <TResponse = unknown>(
    body: { bankId: string; quizId: string; restore?: boolean },
    claims: BffClaims,
  ) =>
    postCore<TResponse>(
      `/api/question-banks/${enc(body.bankId)}/items/${enc(body.quizId)}/retire`,
      claims,
      body.restore !== undefined ? { restore: body.restore } : {},
    ),
  listQuizItemVersions: <TResponse = unknown>(quizId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/quiz-items/${enc(quizId)}/versions`, claims),
  exportQuestionBankToCanvas: <TResponse = unknown>(
    body: { bankId: string; courseId?: string },
    claims: BffClaims,
  ) =>
    postCore<TResponse>(
      `/api/question-banks/${enc(body.bankId)}/canvas-export`,
      claims,
      body.courseId ? { courseId: body.courseId } : {},
    ),
  listQuestionBankSyncJobs: <TResponse = unknown>(bankId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/question-banks/${enc(bankId)}/sync-jobs`, claims),
  getQuestionBankSyncJob: <TResponse = unknown>(jobId: string, claims: BffClaims) =>
    getCore<TResponse>(`/api/question-bank-sync-jobs/${enc(jobId)}`, claims),
  listCanvasQuestionBanks: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    getCore<TResponse>(withQuery("/api/canvas/question-banks", { courseId }), claims),
};
