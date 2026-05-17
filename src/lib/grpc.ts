import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";

const PROTO_PATH = resolve(process.cwd(), "proto/chunking.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

const GRPC_HOST = process.env.GRPC_HOST || "grpc-server:50051";

function createClient() {
  const ChunkingService = proto.chunking?.ChunkingService;
  if (!ChunkingService) {
    throw new Error("ChunkingService not found in proto definition");
  }
  const client = new ChunkingService(
    GRPC_HOST,
    grpc.credentials.createInsecure()
  );
  return client;
}

let _client: any = null;

export function getGrpcClient() {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

// ── Proto shape (snake_case, keepCase: true) ──

interface ProtoLessonCard {
  card_id: string;
  chunk_id: string;
  heading_path: string[];
  title: string;
  bullets: string[];
  key_insight: string;
  card_index: number;
}

interface ProtoCardGroup {
  heading_path: string[];
  cards: ProtoLessonCard[];
}

interface ProtoGetCardsResponse {
  document_id: string;
  sections: ProtoCardGroup[];
  total_cards: number;
}

interface ProtoQuizItem {
  question_id: string;
  chunk_id: string;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  difficulty: string;
  lo_id?: string;
  bloom_level?: string;
}

interface ProtoGetQuizResponse {
  document_id: string;
  questions: ProtoQuizItem[];
  total_questions: number;
}

// ── Public typed helpers ──

export interface GrpcCard {
  cardId: string;
  title: string;
  bullets: string[];
  keyInsight: string;
  cardIndex: number;
  headingPath: string[];
}

export interface GrpcCardsResponse {
  cards: GrpcCard[];
  documentId: string;
  totalCards: number;
}

export async function getCards(
  documentId: string
): Promise<GrpcCardsResponse> {
  const client = getGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetCards(
      { document_id: documentId },
      (err: Error | null, response: ProtoGetCardsResponse) => {
        if (err) return reject(err);
        const cards: GrpcCard[] = [];
        for (const section of response.sections || []) {
          for (const card of section.cards || []) {
            cards.push({
              cardId: card.card_id,
              title: card.title,
              bullets: card.bullets || [],
              keyInsight: card.key_insight,
              cardIndex: card.card_index,
              headingPath: card.heading_path || [],
            });
          }
        }
        resolve({
          cards,
          documentId: response.document_id,
          totalCards: response.total_cards,
        });
      }
    );
  });
}

export interface GrpcQuizItem {
  questionId: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: string;
  questionIndex: number;
}

export interface GrpcQuizResponse {
  quizItems: GrpcQuizItem[];
  documentId: string;
  totalQuestions: number;
}

export async function getQuiz(
  documentId: string
): Promise<GrpcQuizResponse> {
  const client = getGrpcClient();
  return new Promise((resolve, reject) => {
    client.GetQuiz(
      { document_id: documentId },
      (err: Error | null, response: ProtoGetQuizResponse) => {
        if (err) return reject(err);
        resolve({
          quizItems: (response.questions || []).map((q, i) => ({
            questionId: q.question_id,
            question: q.question,
            choices: q.choices || [],
            correctIndex: q.correct_index,
            explanation: q.explanation,
            difficulty: q.difficulty,
            questionIndex: i,
          })),
          documentId: response.document_id,
          totalQuestions: response.total_questions,
        });
      }
    );
  });
}
