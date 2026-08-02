export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type EmptyRpcRequest = Record<string, never>;

type DateString = string;

export interface LaunchSyncRequest {
  lmsType: "openedx" | "moodle" | "canvas";
  lmsSub: string;
  email?: string;
  displayName?: string;
  role: "instructor" | "learner" | "administrator";
  courseRole: "instructor" | "learner" | "ta" | "observer";
  lmsContextId: string;
  contextTitle?: string;
  resourceLinkId?: string;
  targetKind?: "lesson" | "card" | "quiz_set" | "chat" | "video";
  targetId?: string;
  customClaims?: JsonObject;
  agsLineItemUrl?: string;
  agsScoreMaximum?: number;
  agsLabel?: string;
}

export interface LaunchSyncResponse {
  internalUserId: string;
  internalCourseId: string;
  courseRole: "instructor" | "learner" | "ta" | "observer";
  lmsCourseRefId: string;
  resourceLinkId?: string;
}

export interface CourseRecord {
  course_id: string;
  lms_id: string | null;
  code: string;
  name: string;
  description: string | null;
  created_at: DateString | null;
  updated_at: DateString | null;
  deleted_at: DateString | null;
}

export interface ChapterRecord {
  chapter_id: string;
  course_id: string;
  title: string;
  sort_order: number;
  created_at: DateString | null;
  deleted_at: DateString | null;
}

export interface LearningOutcomeRecord {
  lo_id: string;
  chapter_id: string;
  code: string;
  statement_vi: string;
  statement_en: string | null;
  bloom_level: number;
  cdio_level: string;
  academic_year: string | null;
  version: number;
  is_current: boolean;
  created_at: DateString | null;
  deleted_at: DateString | null;
  chapters?: ChapterRecord;
}

export interface DocumentSummary {
  document_id: string;
  title: string;
  file_path: string;
  mime_type: string | null;
  checksum: string | null;
  course_id: string;
  status: string;
  created_by: string | null;
  created_at: DateString | null;
  chunks_count: number;
}

export interface UploadSessionResponse {
  document_id: string;
  upload_url: string;
  file_path: string;
  status: string;
}

export interface ConfirmUploadResponse {
  document_id: string;
  status: string;
  job_id?: string;
}

export interface DeleteDocumentResponse {
  document_id: string;
  success: boolean;
}

export interface LessonRecord {
  lesson_id: string;
  course_id: string;
  lo_id: string;
  title: string;
  status: string;
  published_at: DateString | null;
  created_at: DateString | null;
  updated_at: DateString | null;
  deleted_at: DateString | null;
  learning_outcomes?: LearningOutcomeRecord;
}

export interface LessonCardRecord {
  card_id: string;
  lesson_id: string;
  course_id: string;
  lo_id: string | null;
  title: string;
  content: JsonValue;
  source_chunk_ids: string[];
  status: string;
  published_at: DateString | null;
  created_at: DateString | null;
  updated_at: DateString | null;
  deleted_at: DateString | null;
  lessons?: LessonRecord;
  learning_outcomes?: LearningOutcomeRecord | null;
}

export interface QuizItemRecord {
  quiz_id: string;
  lesson_id: string;
  course_id: string;
  lo_id: string | null;
  type: string;
  question: string;
  options: JsonValue | null;
  correct_answer: JsonValue;
  explanation: string | null;
  bloom_level: number | null;
  source_chunk_ids: string[];
  status: string;
  published_at: DateString | null;
  created_at: DateString | null;
  updated_at: DateString | null;
  deleted_at: DateString | null;
  lessons?: LessonRecord;
  learning_outcomes?: LearningOutcomeRecord | null;
}

export interface ReviewDraftsResponse {
  cards: LessonCardRecord[];
  quizItems: QuizItemRecord[];
}

export interface SubmitQuizRequest {
  lessonId: string;
  resourceLinkId?: string;
  answers: Array<{
    quizId: string;
    chosenAnswer: JsonValue;
    responseTimeMs?: number;
  }>;
}

export interface SubmitQuizResponse {
  score: number;
  totalCorrect: number;
  total: number;
  perItem: Array<{
    quizId: string;
    isCorrect: boolean;
    feedback: string | null;
    correctAnswer: JsonValue;
  }>;
  agsPublished: boolean;
}

export interface QuizAttemptRecord {
  attempt_id: string;
  user_id: string;
  quiz_id: string;
  course_id: string;
  resource_link_id: string | null;
  score: number | string;
  chosen_answer: JsonValue;
  is_correct: boolean;
  response_time_ms: number | null;
  feedback: string | null;
  ags_status: string;
  ags_posted_at: DateString | null;
  attempted_at: DateString | null;
  deleted_at: DateString | null;
  quiz_items: QuizItemRecord;
}

export interface ContentGenerationRequestRecord {
  request_id: string;
  course_id: string;
  requested_by: string | null;
  type: string;
  scope: JsonValue;
  status: string;
  generated_count: number;
  last_error: string | null;
  created_at: DateString | null;
  updated_at: DateString | null;
}

interface RpcDefinition<TRequest, TResponse> {
  request: TRequest;
  response: TResponse;
}

type CourseIdRequest = { courseId: string };
type LessonIdRequest = { lessonId: string };
type LessonContentRequest = LessonIdRequest & { status?: string };
type CardIdRequest = { cardId: string };
type QuizIdRequest = { quizId: string };

export interface CoreRpcContract {
  LaunchSync: RpcDefinition<LaunchSyncRequest, LaunchSyncResponse>;
  ListCourses: RpcDefinition<EmptyRpcRequest, CourseRecord[]>;
  GetCourse: RpcDefinition<CourseIdRequest, CourseRecord>;
  ListChapters: RpcDefinition<CourseIdRequest, ChapterRecord[]>;
  ListLearningOutcomes: RpcDefinition<CourseIdRequest, LearningOutcomeRecord[]>;
  CreateUploadSession: RpcDefinition<
    {
      courseId: string;
      title: string;
      fileName: string;
      mimeType?: string;
      checksum?: string;
    },
    UploadSessionResponse
  >;
  ConfirmUpload: RpcDefinition<{ documentId: string }, ConfirmUploadResponse>;
  ListDocuments: RpcDefinition<
    CourseIdRequest & { limit?: number; offset?: number },
    DocumentSummary[]
  >;
  DeleteDocument: RpcDefinition<{ documentId: string }, DeleteDocumentResponse>;
  ListLessons: RpcDefinition<
    CourseIdRequest & { status?: string },
    LessonRecord[]
  >;
  GetLesson: RpcDefinition<LessonIdRequest, LessonRecord>;
  GetLessonCards: RpcDefinition<LessonContentRequest, LessonCardRecord[]>;
  GetLessonQuiz: RpcDefinition<LessonContentRequest, QuizItemRecord[]>;
  PublishLesson: RpcDefinition<LessonIdRequest, LessonRecord>;
  ListReviewDrafts: RpcDefinition<
    CourseIdRequest & { kind?: "card" | "quiz" },
    ReviewDraftsResponse
  >;
  ApproveCard: RpcDefinition<CardIdRequest, LessonCardRecord>;
  RejectCard: RpcDefinition<
    CardIdRequest & { reason?: string },
    LessonCardRecord
  >;
  UpdateCard: RpcDefinition<
    CardIdRequest & { content: JsonValue },
    LessonCardRecord
  >;
  ApproveQuizItem: RpcDefinition<QuizIdRequest, QuizItemRecord>;
  RejectQuizItem: RpcDefinition<
    QuizIdRequest & { reason?: string },
    QuizItemRecord
  >;
  UpdateQuizItem: RpcDefinition<
    QuizIdRequest & {
      data: {
        question?: string;
        options?: JsonValue;
        correct_answer?: JsonValue;
        explanation?: string;
      };
    },
    QuizItemRecord
  >;
  SubmitQuiz: RpcDefinition<SubmitQuizRequest, SubmitQuizResponse>;
  ListQuizAttempts: RpcDefinition<LessonIdRequest, QuizAttemptRecord[]>;
  CreateContentGenerationRequest: RpcDefinition<
    CourseIdRequest & { type: "card" | "quiz"; scope: JsonObject },
    ContentGenerationRequestRecord
  >;
}

export type CoreRpcMethod = keyof CoreRpcContract;
export type CoreRpcRequest<TMethod extends CoreRpcMethod> =
  CoreRpcContract[TMethod]["request"];
export type CoreRpcResponse<TMethod extends CoreRpcMethod> =
  CoreRpcContract[TMethod]["response"];

export interface JsonRequestEnvelope {
  json?: string;
}

export interface JsonResponseEnvelope {
  json?: string;
}
