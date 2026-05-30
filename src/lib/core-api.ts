import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { mintCoreJwt, type BffClaims } from "./bff-jwt";
import type { LtiSession } from "./session";

type CoreMethod =
  | "LaunchSync"
  | "ListCourses"
  | "GetCourse"
  | "ListChapters"
  | "ListLearningOutcomes"
  | "CreateUploadSession"
  | "ConfirmUpload"
  | "ListDocuments"
  | "DeleteDocument"
  | "ListLessons"
  | "GetLesson"
  | "GetLessonCards"
  | "GetLessonQuiz"
  | "PublishLesson"
  | "ListReviewDrafts"
  | "ApproveCard"
  | "RejectCard"
  | "UpdateCard"
  | "ApproveQuizItem"
  | "RejectQuizItem"
  | "UpdateQuizItem"
  | "SubmitQuiz"
  | "ListQuizAttempts"
  | "CreateContentGenerationRequest";

type JsonResponse = { json?: string };

export class CoreApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(typeof body === "string" ? body : `Core API Error: ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function claimsFromSession(session: LtiSession): BffClaims {
  return {
    sub: session.internalUserId,
    courseId: session.courseId || undefined,
    roles: [session.courseRole, session.role, ...session.roles].filter(Boolean),
    scope: "course",
  };
}

const PROTO_PATH = resolve(process.cwd(), "proto/core_api.proto");
const GRPC_HOST = process.env.CORE_API_GRPC_HOST || "core-api:50051";

type GrpcClient = Record<string, Function>;

let client: GrpcClient | null = null;

function getClient(): GrpcClient {
  if (client) {
    return client;
  }

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
  const Service = loaded.ai_lms?.v1?.CoreApiService;
  if (!Service) {
    throw new Error("CoreApiService not found in proto definition");
  }

  client = new Service(GRPC_HOST, grpc.credentials.createInsecure()) as GrpcClient;
  return client;
}

async function callCore<TResponse>(
  method: CoreMethod,
  body: unknown,
  claims: BffClaims,
): Promise<TResponse> {
  const token = await mintCoreJwt(claims);
  const metadata = new grpc.Metadata();
  metadata.set("authorization", `Bearer ${token}`);

  const request =
    method === "ListCourses"
      ? {}
      : { json: JSON.stringify(body ?? {}) };

  return new Promise((resolvePromise, reject) => {
    const grpcClient = getClient();
    grpcClient[method](
      request,
      metadata,
      (error: grpc.ServiceError | null, response: JsonResponse) => {
        if (error) {
          reject(new CoreApiError(error.code || 500, error.details || error.message));
          return;
        }

        if (!response?.json) {
          resolvePromise(null as TResponse);
          return;
        }

        resolvePromise(JSON.parse(response.json) as TResponse);
      },
    );
  });
}

export const coreApi = {
  launchSync: <TResponse = unknown>(body: unknown) =>
    callCore<TResponse>("LaunchSync", body, {
      sub: "lti-bootstrap",
      roles: ["system"],
      scope: "admin",
    }),
  listCourses: <TResponse = unknown>(claims: BffClaims) =>
    callCore<TResponse>("ListCourses", {}, claims),
  getCourse: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    callCore<TResponse>("GetCourse", { courseId }, claims),
  listChapters: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    callCore<TResponse>("ListChapters", { courseId }, claims),
  listLearningOutcomes: <TResponse = unknown>(courseId: string, claims: BffClaims) =>
    callCore<TResponse>("ListLearningOutcomes", { courseId }, claims),
  createUploadSession: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    callCore<TResponse>("CreateUploadSession", body, claims),
  confirmUpload: <TResponse = unknown>(documentId: string, claims: BffClaims) =>
    callCore<TResponse>("ConfirmUpload", { documentId }, claims),
  listDocuments: <TResponse = unknown>(
    body: { courseId: string; limit?: number; offset?: number },
    claims: BffClaims,
  ) => callCore<TResponse>("ListDocuments", body, claims),
  deleteDocument: <TResponse = unknown>(documentId: string, claims: BffClaims) =>
    callCore<TResponse>("DeleteDocument", { documentId }, claims),
  listLessons: <TResponse = unknown>(
    body: { courseId: string; status?: string },
    claims: BffClaims,
  ) => callCore<TResponse>("ListLessons", body, claims),
  getLesson: <TResponse = unknown>(lessonId: string, claims: BffClaims) =>
    callCore<TResponse>("GetLesson", { lessonId }, claims),
  lessonCards: <TResponse = unknown>(
    lessonId: string,
    claims: BffClaims,
    status = "PUBLISHED",
  ) => callCore<TResponse>("GetLessonCards", { lessonId, status }, claims),
  lessonQuiz: <TResponse = unknown>(
    lessonId: string,
    claims: BffClaims,
    status = "PUBLISHED",
  ) => callCore<TResponse>("GetLessonQuiz", { lessonId, status }, claims),
  publishLesson: <TResponse = unknown>(lessonId: string, claims: BffClaims) =>
    callCore<TResponse>("PublishLesson", { lessonId }, claims),
  listReviewDrafts: <TResponse = unknown>(
    body: { courseId: string; kind?: "card" | "quiz" },
    claims: BffClaims,
  ) => callCore<TResponse>("ListReviewDrafts", body, claims),
  approveCard: <TResponse = unknown>(cardId: string, claims: BffClaims) =>
    callCore<TResponse>("ApproveCard", { cardId }, claims),
  rejectCard: <TResponse = unknown>(cardId: string, reason: string, claims: BffClaims) =>
    callCore<TResponse>("RejectCard", { cardId, reason }, claims),
  updateCard: <TResponse = unknown>(cardId: string, content: unknown, claims: BffClaims) =>
    callCore<TResponse>("UpdateCard", { cardId, content }, claims),
  approveQuizItem: <TResponse = unknown>(quizId: string, claims: BffClaims) =>
    callCore<TResponse>("ApproveQuizItem", { quizId }, claims),
  rejectQuizItem: <TResponse = unknown>(quizId: string, reason: string, claims: BffClaims) =>
    callCore<TResponse>("RejectQuizItem", { quizId, reason }, claims),
  updateQuizItem: <TResponse = unknown>(quizId: string, data: unknown, claims: BffClaims) =>
    callCore<TResponse>("UpdateQuizItem", { quizId, data }, claims),
  submitQuiz: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    callCore<TResponse>("SubmitQuiz", body, claims),
  listQuizAttempts: <TResponse = unknown>(lessonId: string, claims: BffClaims) =>
    callCore<TResponse>("ListQuizAttempts", { lessonId }, claims),
  createContentGenerationRequest: <TResponse = unknown>(body: unknown, claims: BffClaims) =>
    callCore<TResponse>("CreateContentGenerationRequest", body, claims),
};
