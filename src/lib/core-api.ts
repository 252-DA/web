import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { mintCoreJwt, type BffClaims } from "./bff-jwt";
import type { LtiSession } from "./session";
import type {
  CoreRpcMethod,
  CoreRpcRequest,
  CoreRpcResponse,
  JsonRequestEnvelope,
  JsonResponseEnvelope,
  JsonValue,
} from "./core-api-contract";

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

type UnaryClientMethod = (
  request: JsonRequestEnvelope | Record<string, never>,
  metadata: grpc.Metadata,
  callback: grpc.requestCallback<JsonResponseEnvelope>,
) => grpc.ClientUnaryCall;

type GrpcClient = grpc.Client & {
  [TMethod in CoreRpcMethod]: UnaryClientMethod;
};

interface CoreServiceClientConstructor {
  new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: Partial<grpc.ChannelOptions>,
  ): GrpcClient;
  service: grpc.ServiceDefinition;
  serviceName: string;
}

interface LoadedCorePackage {
  ai_lms?: {
    v1?: {
      CoreApiService?: CoreServiceClientConstructor;
    };
  };
}

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
  const loaded = grpc.loadPackageDefinition(
    packageDefinition,
  ) as unknown as LoadedCorePackage;
  const Service = loaded.ai_lms?.v1?.CoreApiService;
  if (!Service) {
    throw new Error("CoreApiService not found in proto definition");
  }

  client = new Service(
    GRPC_HOST,
    grpc.credentials.createInsecure(),
  ) as GrpcClient;
  return client;
}

async function callCore<TMethod extends CoreRpcMethod>(
  method: TMethod,
  body: CoreRpcRequest<TMethod>,
  claims: BffClaims,
): Promise<CoreRpcResponse<TMethod>> {
  const token = await mintCoreJwt(claims);
  const metadata = new grpc.Metadata();
  metadata.set("authorization", `Bearer ${token}`);

  const request =
    method === "ListCourses" ? {} : { json: JSON.stringify(body ?? {}) };

  return new Promise((resolvePromise, reject) => {
    const grpcClient = getClient();
    grpcClient[method](
      request,
      metadata,
      (
        error: grpc.ServiceError | null,
        response: JsonResponseEnvelope | undefined,
      ) => {
        if (error) {
          reject(
            new CoreApiError(error.code || 500, error.details || error.message),
          );
          return;
        }

        if (!response?.json) {
          reject(
            new CoreApiError(
              grpc.status.INTERNAL,
              "Missing gRPC JSON response",
            ),
          );
          return;
        }

        const parsed: unknown = JSON.parse(response.json);
        resolvePromise(parsed as CoreRpcResponse<TMethod>);
      },
    );
  });
}

export const coreApi = {
  launchSync: (body: CoreRpcRequest<"LaunchSync">) =>
    callCore("LaunchSync", body, {
      sub: "lti-bootstrap",
      roles: ["system"],
      scope: "admin",
    }),
  listCourses: (claims: BffClaims) => callCore("ListCourses", {}, claims),
  getCourse: (courseId: string, claims: BffClaims) =>
    callCore("GetCourse", { courseId }, claims),
  listChapters: (courseId: string, claims: BffClaims) =>
    callCore("ListChapters", { courseId }, claims),
  listLearningOutcomes: (courseId: string, claims: BffClaims) =>
    callCore("ListLearningOutcomes", { courseId }, claims),
  createUploadSession: (
    body: CoreRpcRequest<"CreateUploadSession">,
    claims: BffClaims,
  ) => callCore("CreateUploadSession", body, claims),
  confirmUpload: (documentId: string, claims: BffClaims) =>
    callCore("ConfirmUpload", { documentId }, claims),
  listDocuments: (body: CoreRpcRequest<"ListDocuments">, claims: BffClaims) =>
    callCore("ListDocuments", body, claims),
  deleteDocument: (documentId: string, claims: BffClaims) =>
    callCore("DeleteDocument", { documentId }, claims),
  listLessons: (body: CoreRpcRequest<"ListLessons">, claims: BffClaims) =>
    callCore("ListLessons", body, claims),
  getLesson: (lessonId: string, claims: BffClaims) =>
    callCore("GetLesson", { lessonId }, claims),
  lessonCards: (lessonId: string, claims: BffClaims, status = "PUBLISHED") =>
    callCore("GetLessonCards", { lessonId, status }, claims),
  lessonQuiz: (lessonId: string, claims: BffClaims, status = "PUBLISHED") =>
    callCore("GetLessonQuiz", { lessonId, status }, claims),
  publishLesson: (lessonId: string, claims: BffClaims) =>
    callCore("PublishLesson", { lessonId }, claims),
  listReviewDrafts: (
    body: CoreRpcRequest<"ListReviewDrafts">,
    claims: BffClaims,
  ) => callCore("ListReviewDrafts", body, claims),
  approveCard: (cardId: string, claims: BffClaims) =>
    callCore("ApproveCard", { cardId }, claims),
  rejectCard: (cardId: string, reason: string, claims: BffClaims) =>
    callCore("RejectCard", { cardId, reason }, claims),
  updateCard: (cardId: string, content: JsonValue, claims: BffClaims) =>
    callCore("UpdateCard", { cardId, content }, claims),
  approveQuizItem: (quizId: string, claims: BffClaims) =>
    callCore("ApproveQuizItem", { quizId }, claims),
  rejectQuizItem: (quizId: string, reason: string, claims: BffClaims) =>
    callCore("RejectQuizItem", { quizId, reason }, claims),
  updateQuizItem: (
    quizId: string,
    data: CoreRpcRequest<"UpdateQuizItem">["data"],
    claims: BffClaims,
  ) => callCore("UpdateQuizItem", { quizId, data }, claims),
  submitQuiz: (body: CoreRpcRequest<"SubmitQuiz">, claims: BffClaims) =>
    callCore("SubmitQuiz", body, claims),
  listQuizAttempts: (lessonId: string, claims: BffClaims) =>
    callCore("ListQuizAttempts", { lessonId }, claims),
  createContentGenerationRequest: (
    body: CoreRpcRequest<"CreateContentGenerationRequest">,
    claims: BffClaims,
  ) => callCore("CreateContentGenerationRequest", body, claims),
};
