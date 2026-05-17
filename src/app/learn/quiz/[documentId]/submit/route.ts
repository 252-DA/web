import { NextRequest, NextResponse } from "next/server";
import { readLtiSession } from "@/lib/session";
import { getQuiz } from "@/lib/grpc";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  // ── Read session ──
  const activeSession = await readLtiSession(request.nextUrl.searchParams.get("sid"));
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  // ── Parse form data ──
  const formData = await request.formData();

  // ── Fetch correct answers from gRPC ──
  let quizItems;
  try {
    const result = await getQuiz(documentId);
    quizItems = result.quizItems || [];
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load quiz data", detail: err.message },
      { status: 500 }
    );
  }

  // ── Grade ──
  let correct = 0;
  const total = quizItems.length;
  const results: { questionId: string; userAnswer: number; correctAnswer: number; correct: boolean }[] = [];

  for (const item of quizItems) {
    const userAnswerStr = formData.get(`q_${item.questionId}`) as string | null;
    const userAnswer = userAnswerStr !== null ? parseInt(userAnswerStr, 10) : -1;
    const isCorrect = userAnswer === item.correctIndex;

    if (isCorrect) correct++;

    results.push({
      questionId: item.questionId,
      userAnswer,
      correctAnswer: item.correctIndex,
      correct: isCorrect,
    });
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;

  // TODO: LTI AGS scorePublish — chưa implement trong MVP này

  return NextResponse.json({
    score,
    correct,
    total,
    results,
    // Chưa publish AGS grade
    agsPublished: false,
  });
}
