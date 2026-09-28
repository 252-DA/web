import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { InstructorNav } from "@/components/instructor-nav";
import { deepLinkAccess } from "@/lib/lti-deep-link-session";
import type { QuizBuilderContext } from "@/lib/canvas-quiz";
import type { ContentGenerationRequest } from "@/lib/quiz";
import { QuizBuilder } from "./quiz-builder";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function QuizBuilderPage({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Bạn không có quyền soạn đề cho khóa học này.</main>;
  }
  const { sid, session } = access.active;
  const courseId = session.courseId;
  const claims = claimsFromSession(session);
  // Mở từ hộp thoại "Sinh quiz bằng DA" của module: giữ phiên Deep Linking để
  // lưu xong thêm thẳng vào module, không phải rời Canvas.
  const flowParam = Array.isArray(sp.flow) ? sp.flow[0] : sp.flow;
  let flow: { id: string } | undefined;
  if (flowParam) {
    try {
      const link = await deepLinkAccess(flowParam, Array.isArray(sp.sid) ? sp.sid[0] : sp.sid);
      flow = { id: link.flowId };
    } catch {
      flow = undefined;
    }
  }

  let context: QuizBuilderContext | null = null;
  let requests: ContentGenerationRequest[] = [];
  let error = "";
  try {
    const [ctx, rows] = await Promise.all([
      coreApi.quizBuilderContext<QuizBuilderContext>({ courseId, loIds: [] }, claims),
      coreApi.listContentGenerationRequests<ContentGenerationRequest[]>({ courseId, type: "quiz", limit: 100 }, claims),
    ]);
    context = ctx;
    requests = (rows ?? []).filter(
      (r) => r.scope && typeof r.scope === "object" && (r.scope as { origin?: unknown }).origin === "quiz_builder",
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được dữ liệu soạn đề.";
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-sm text-slate-500">DA Platform · Giảng viên</p>
          <h1 className="mt-1 text-2xl font-semibold">Soạn đề theo ma trận</h1>
          <p className="mt-1 text-sm text-slate-600">
            Chọn chương và tài liệu nguồn, đặt số câu cho từng LO ở từng mức Bloom, duyệt câu rồi lưu thành đề.{" "}
            {flow
              ? "Bấm “Lưu và thêm vào module” để đưa đề vào module vừa mở."
              : "Đề đã lưu thêm vào Canvas qua menu module → Sinh quiz bằng DA → Dùng lại quiz đã tạo."}
          </p>
          {flow ? (
            <a
              href={`/lti/deep-link?flow=${encodeURIComponent(flow.id)}${sid ? `&sid=${encodeURIComponent(sid)}` : ""}`}
              className="mt-3 inline-block text-sm font-medium text-sky-700 underline"
            >
              ← Quay lại hộp thoại sinh quiz
            </a>
          ) : (
            <InstructorNav active="quizzes" courseId={courseId} sid={sid} />
          )}
        </div>
      </header>
      {error || !context ? (
        <p className="mx-auto mt-6 max-w-6xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error || "Không tải được dữ liệu soạn đề."}
        </p>
      ) : (
        <QuizBuilder sid={sid} flow={flow?.id} initial={{ ...context, requests }} />
      )}
    </main>
  );
}
