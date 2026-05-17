import { readLtiSession } from "@/lib/session";
import { getCards, GrpcCard } from "@/lib/grpc";

interface Props {
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

export default async function CardsPage({ searchParams }: Props) {
  // ── Read session from cookie ──
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

  const { sid, session } = activeSession;

  if (!session.documentId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 shadow-md text-center">
          <h1 className="text-2xl font-bold text-yellow-600 mb-4">Chưa chọn tài liệu</h1>
          <p className="text-gray-600">Vui lòng cấu hình document_id trong Studio.</p>
          <p className="text-sm text-gray-400 mt-2">Course: {session.courseId}</p>
        </div>
      </div>
    );
  }

  // ── Fetch cards via gRPC ──
  let cards: GrpcCard[] = [];
  let documentName = "";
  let errorMsg = "";

  try {
    const result = await getCards(session.documentId);
    cards = result.cards || [];
    documentName = result.documentId || "";
  } catch (err: any) {
    errorMsg = err.message || "Không thể tải dữ liệu từ backend.";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">AI Micro-Learning</h1>
            {documentName && (
              <p className="text-sm text-gray-500">{documentName}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {session.displayName || session.email || "Học viên"}
            </span>
            <a
              href={appendSid(`/learn/quiz/${session.documentId}`, sid)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"
            >
              Làm Quiz →
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{errorMsg}</p>
          </div>
        )}

        {cards.length === 0 && !errorMsg && (
          <div className="text-center py-12">
            <p className="text-gray-500">Chưa có card nào được tạo cho tài liệu này.</p>
            <p className="text-sm text-gray-400 mt-1">Hãy đảm bảo enrichment worker đã xử lý xong.</p>
          </div>
        )}

        <div className="space-y-6">
          {cards.map((card) => (
            <div
              key={card.cardId}
              className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition"
            >
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">
                  {card.cardIndex + 1}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {card.title}
                  </h3>
                  {card.headingPath && card.headingPath.length > 0 && (
                    <p className="text-xs text-gray-400 mb-2">
                      {card.headingPath.join(" › ")}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {(card.bullets || []).map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-700">
                        <span className="text-indigo-500 mt-1">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  {card.keyInsight && (
                    <div className="mt-3 bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                      <p className="text-sm text-amber-800">
                        <strong>💡 Key insight:</strong> {card.keyInsight}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
