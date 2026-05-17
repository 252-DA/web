import { readLtiSession } from "@/lib/session";
import { getQuiz, GrpcQuizItem } from "@/lib/grpc";

interface Props {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function appendSid(path: string, sid?: string): string {
  if (!sid) {
    return path;
  }
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function QuizPage({ params, searchParams }: Props) {
  const { documentId } = await params;

  // ── Read session ──
  const sp = await searchParams;
  const activeSession = await readLtiSession(sp?.sid);
  if (!activeSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Phiên hết hạn</h1>
          <p className="text-gray-600">Vui lòng mở lại từ LMS.</p>
        </div>
      </div>
    );
  }

  const { sid } = activeSession;

  // ── Fetch quiz via gRPC ──
  let quizItems: GrpcQuizItem[] = [];
  let documentName = "";
  let errorMsg = "";

  try {
    const result = await getQuiz(documentId);
    quizItems = result.quizItems || [];
    documentName = result.documentId || "";
  } catch (err: any) {
    errorMsg = err.message || "Không thể tải quiz từ backend.";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Quiz</h1>
            {documentName && <p className="text-sm text-gray-500">{documentName}</p>}
          </div>
          <a href={appendSid("/learn/cards", sid)} className="text-sm text-indigo-600 hover:underline">
            ← Quay lại Cards
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{errorMsg}</p>
          </div>
        )}

        {quizItems.length === 0 && !errorMsg && (
          <div className="text-center py-12">
            <p className="text-gray-500">Chưa có câu hỏi nào cho tài liệu này.</p>
          </div>
        )}

        <form action={appendSid(`/learn/quiz/${documentId}/submit`, sid)} method="POST">
          <div className="space-y-6">
            {quizItems.map((item, idx) => (
              <div
                key={item.questionId}
                className="bg-white rounded-xl shadow-md p-6 border border-gray-100"
              >
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </span>
                  <h3 className="text-lg font-medium text-gray-900">{item.question}</h3>
                </div>
                <div className="ml-11 space-y-2">
                  {(item.choices || []).map((choice, ci) => (
                    <label
                      key={ci}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition"
                    >
                      <input
                        type="radio"
                        name={`q_${item.questionId}`}
                        value={ci}
                        className="w-4 h-4 text-purple-600"
                      />
                      <span className="text-gray-700">{choice}</span>
                    </label>
                  ))}
                </div>
                <p className="ml-11 mt-2 text-xs text-gray-400">
                  Độ khó: {item.difficulty}
                </p>
              </div>
            ))}
          </div>

          {quizItems.length > 0 && (
            <div className="mt-8 text-center">
              <button
                type="submit"
                className="px-8 py-3 bg-purple-600 text-white text-lg font-semibold rounded-xl hover:bg-purple-700 transition shadow-lg"
              >
                Nộp bài
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
