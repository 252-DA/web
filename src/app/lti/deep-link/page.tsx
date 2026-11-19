import { deepLinkAccess, loadQuizContext } from "@/lib/lti-deep-link-session";
import { QuizComposer } from "./quiz-composer";

export default async function DeepLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  let active;
  let context;
  try {
    active = await deepLinkAccess(first(sp.flow), first(sp.sid));
    context = await loadQuizContext(active);
  } catch (error) {
    return (
      <main className="p-8 text-slate-700">
        <h1 className="mb-3 text-xl font-semibold">Sinh quiz trong Canvas</h1>
        <p>{error instanceof Error ? error.message : "Không thể mở quiz."}</p>
        <p className="mt-3">Đóng hộp thoại và mở lại từ menu ⋮ của module.</p>
      </main>
    );
  }
  return (
    <QuizComposer flowId={active.flowId} sid={active.sid} initial={context} />
  );
}
