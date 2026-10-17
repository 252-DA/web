import { readManageSession } from "@/lib/session";
import { claimsFromSession, coreApi } from "@/lib/core-api";
import { CHAT_MODES, CHAT_MODE_INFO, isChatMode, type ChatCitation, type ChatMode, type ChatToolCall } from "@/lib/chat";
import { InstructorNav } from "@/components/instructor-nav";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Settings = { mode: string; updated_at: string | null; updated_by: string | null };
type ModeStat = {
  mode: ChatMode;
  runs: number;
  errors: number;
  avg_latency_ms: number | null;
  avg_steps: number | null;
  avg_input_tokens: number | null;
  avg_output_tokens: number | null;
  rated_up: number;
  rated_down: number;
};
type Run = {
  run_id: string;
  created_at: string;
  mode: string;
  source: string;
  question_type: string | null;
  question: string;
  answer: string | null;
  citations: ChatCitation[];
  tool_calls: ChatToolCall[];
  model: string | null;
  steps: number;
  latency_ms: number | null;
  status: string;
  error: string | null;
  rating: number | null;
};
type Graph = {
  documents: { document_id: string; title: string; role: string | null; chapter_code: string | null; relations: number }[];
  chapters: { chapter_id: string; code: string; title: string }[];
  total_relations: number;
  requests: { request_id: string; status: string; generated_count: number | null; last_error: string | null; created_at: string }[];
};
type Stats = { settings: Settings; modes: ModeStat[]; recent: Run[]; graph: Graph | null };

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function formatTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

const seconds = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)}s`);
const num = (n: number | null) => (n == null ? "–" : String(n));

export default async function ManageChat({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden") {
    return <main className="p-8 text-slate-700">Chỉ giảng viên, trợ giảng và admin được xem trang này.</main>;
  }

  const { sid, session } = access.active;
  const isAdmin = session.role === "administrator";
  const sourceFilter = first(sp.source) === "eval" ? "eval" : first(sp.source) === "web" ? "web" : undefined;

  let stats: Stats | null = null;
  let error = "";
  try {
    stats = await coreApi.getChatStats<Stats>({ courseId: session.courseId, source: sourceFilter }, claimsFromSession(session));
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được số liệu chatbot.";
  }

  const current: ChatMode = stats && isChatMode(stats.settings.mode) ? stats.settings.mode : "vector";
  const graph = stats?.graph ?? null;
  const actionError = first(sp.reviewError);
  const actionSuccess = first(sp.reviewSuccess);
  const building = graph?.requests.some((r) => r.status === "PENDING" || r.status === "PROCESSING") ?? false;
  const graphEmpty = (graph?.total_relations ?? 0) === 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">{isAdmin ? "Admin" : "Giảng viên"}</p>
          <h1 className="text-xl font-semibold">Chatbot: chế độ truy xuất</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ba chế độ dùng cùng mô hình, cùng prompt trả lời, chỉ khác cách tìm ngữ cảnh. Mỗi câu hỏi đều được ghi lại
            (chế độ, bước, token, độ trễ, 👍/👎) để so sánh bằng số đo.
          </p>
          <InstructorNav active="chat" courseId={session.courseId} sid={sid} isAdmin={isAdmin} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {actionSuccess && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>
        )}

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="font-semibold">Chế độ đang chạy</p>
            <p className="mt-1 text-sm text-slate-600">
              Áp dụng cho mọi khóa học, có hiệu lực từ câu hỏi kế tiếp.
              {stats?.settings.updated_at
                ? ` Đổi lần cuối bởi ${stats.settings.updated_by ?? "không rõ"} lúc ${formatTime(stats.settings.updated_at)}.`
                : " Chưa ai đổi: đang dùng mặc định (A)."}
            </p>
          </div>
          <form method="post" action={withSid("/api/chat-mode", sid)} className="space-y-3 px-4 py-4">
            <div className="grid gap-3 md:grid-cols-3">
              {CHAT_MODES.map((mode) => {
                const info = CHAT_MODE_INFO[mode];
                return (
                  <label
                    key={mode}
                    className={`block rounded-lg border p-3 text-sm ${
                      isAdmin ? "cursor-pointer" : "opacity-80"
                    } ${mode === current ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <input type="radio" name="mode" value={mode} defaultChecked={mode === current} disabled={!isAdmin} />
                      {info.letter}. {info.title}
                      {mode === current && (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">đang chạy</span>
                      )}
                    </span>
                    <span className="mt-1 block text-slate-600">{info.detail}</span>
                  </label>
                );
              })}
            </div>
            {isAdmin ? (
              <button className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                Lưu chế độ
              </button>
            ) : (
              <p className="text-sm text-slate-500">Chỉ admin của LMS được đổi chế độ.</p>
            )}
            {current === "graph" && graphEmpty && (
              <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Khóa học này chưa có quan hệ nào trong đồ thị nên chế độ C sẽ giống chế độ B. Hãy dựng đồ thị ở phần dưới.
              </p>
            )}
          </form>
        </div>

        {graph && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="font-semibold">Đồ thị quan hệ của khóa học ({graph.total_relations} quan hệ)</p>
              <p className="mt-1 text-sm text-slate-600">
                Chỉ chế độ C dùng. Mô hình đọc từng đoạn tài liệu và rút ra các quan hệ (nguyên nhân, thành phần, đối lập,
                tiên quyết…); mỗi quan hệ phải kèm câu trích nguyên văn từ tài liệu, không có thì bị bỏ. Dựng theo từng
                chương để kiểm soát chi phí.
              </p>
            </div>
            <div className="grid gap-6 px-4 py-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">Dựng theo chương</p>
                {graph.chapters.length === 0 ? (
                  <p className="text-sm text-slate-500">Khóa học chưa có chương nào trong đề cương.</p>
                ) : (
                  <form method="post" action={withSid("/api/relations", sid)} className="flex flex-wrap items-end gap-2">
                    <select name="chapterId" className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm">
                      {graph.chapters.map((c) => (
                        <option key={c.chapter_id} value={c.chapter_id}>
                          {c.code} · {c.title}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={building}
                      className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      Dựng đồ thị
                    </button>
                  </form>
                )}
                {graph.documents.length > 0 && (
                  <form method="post" action={withSid("/api/relations", sid)} className="mt-4 flex flex-wrap items-end gap-2">
                    <select name="documentId" className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm">
                      {graph.documents.map((d) => (
                        <option key={d.document_id} value={d.document_id}>
                          {d.title}
                          {d.relations ? ` (${d.relations})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={building}
                      className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50"
                    >
                      Dựng cho tài liệu này
                    </button>
                  </form>
                )}
                {building && <p className="mt-2 text-sm text-amber-700">Đang có yêu cầu chạy; tải lại trang để xem kết quả.</p>}
                {graph.requests.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {graph.requests.map((r) => (
                      <li key={r.request_id}>
                        {formatTime(r.created_at)} ·{" "}
                        <span className={r.status === "FAILED" ? "font-medium text-red-700" : undefined}>{r.status}</span>
                        {r.generated_count != null ? ` · ${r.generated_count} quan hệ` : ""}
                        {r.last_error ? ` · ${r.last_error}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Quan hệ theo tài liệu</p>
                <ul className="max-h-56 space-y-1 overflow-auto text-sm">
                  {graph.documents.map((d) => (
                    <li key={d.document_id} className="flex justify-between gap-3">
                      <span className="truncate text-slate-700">
                        {d.chapter_code ? `${d.chapter_code} · ` : ""}
                        {d.title}
                      </span>
                      <span className={d.relations ? "font-medium" : "text-slate-400"}>{d.relations}</span>
                    </li>
                  ))}
                  {graph.documents.length === 0 && <li className="text-slate-500">Chưa có tài liệu đã lập chỉ mục.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <p className="font-semibold">So sánh ba chế độ</p>
            <div className="flex gap-2 text-sm">
              {[
                { label: "Tất cả", value: undefined },
                { label: "Người dùng", value: "web" },
                { label: "Bộ đánh giá", value: "eval" },
              ].map((f) => (
                <a
                  key={f.label}
                  href={withSid(`/manage/chat${f.value ? `?source=${f.value}` : ""}`, sid)}
                  className={`rounded border px-3 py-1 ${
                    f.value === sourceFilter ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {f.label}
                </a>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Chế độ</th>
                  <th className="px-4 py-2">Lượt</th>
                  <th className="px-4 py-2">Lỗi</th>
                  <th className="px-4 py-2">Độ trễ TB</th>
                  <th className="px-4 py-2">Bước TB</th>
                  <th className="px-4 py-2">Token vào / ra TB</th>
                  <th className="px-4 py-2">👍 / 👎</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(stats?.modes ?? []).map((m) => (
                  <tr key={m.mode}>
                    <td className="px-4 py-2 font-medium">
                      {CHAT_MODE_INFO[m.mode].letter}. {CHAT_MODE_INFO[m.mode].title}
                    </td>
                    <td className="px-4 py-2">{m.runs}</td>
                    <td className={`px-4 py-2 ${m.errors ? "font-medium text-red-700" : ""}`}>{m.errors}</td>
                    <td className="px-4 py-2">{seconds(m.avg_latency_ms)}</td>
                    <td className="px-4 py-2">{num(m.avg_steps)}</td>
                    <td className="px-4 py-2">
                      {num(m.avg_input_tokens)} / {num(m.avg_output_tokens)}
                    </td>
                    <td className="px-4 py-2">
                      {m.rated_up} / {m.rated_down}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Độ đúng và độ bám nguồn không tự tính được: dùng bộ đánh giá (<code>ai-tutor/scripts/chat_eval.py</code>) rồi hai
            người chấm mù.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="font-semibold">20 lượt gần nhất</p>
          </div>
          <div className="divide-y divide-slate-100">
            {(stats?.recent ?? []).map((run) => (
              <details key={run.run_id} className="px-4 py-3 text-sm">
                <summary className="cursor-pointer">
                  <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">
                    {isChatMode(run.mode) ? CHAT_MODE_INFO[run.mode].letter : run.mode}
                  </span>
                  {run.question_type && <span className="mr-2 text-xs text-slate-500">{run.question_type}</span>}
                  {run.question.length > 110 ? `${run.question.slice(0, 110)}…` : run.question}
                  <span className="ml-2 text-xs text-slate-500">
                    {formatTime(run.created_at)} · {run.steps} bước · {seconds(run.latency_ms)}
                    {run.rating === 1 ? " · 👍" : run.rating === -1 ? " · 👎" : ""}
                    {run.status === "ERROR" ? " · LỖI" : ""}
                  </span>
                </summary>
                <div className="mt-2 space-y-2 text-slate-700">
                  {run.error && <p className="text-red-700">{run.error}</p>}
                  {run.answer && <p className="whitespace-pre-wrap">{run.answer}</p>}
                  {run.tool_calls.length > 0 && (
                    <ol className="list-decimal pl-5 text-xs text-slate-600">
                      {run.tool_calls.map((call, i) => (
                        <li key={i}>
                          <code>{call.tool}</code> {call.args ? JSON.stringify(call.args) : ""}
                          {typeof call.found === "number" ? ` → ${call.found}` : ""}
                          {call.ok === false ? ` (lỗi: ${call.error})` : ""}
                        </li>
                      ))}
                    </ol>
                  )}
                  {run.citations.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Trích dẫn:{" "}
                      {run.citations
                        .map((c) => `[${c.index}] ${c.heading_path[c.heading_path.length - 1] ?? "?"}${c.page_number ? ` tr.${c.page_number}` : ""}`)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">{run.model}</p>
                </div>
              </details>
            ))}
            {(stats?.recent ?? []).length === 0 && <p className="p-6 text-sm text-slate-500">Chưa có lượt hỏi đáp nào.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
