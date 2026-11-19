import { readManageSession } from "@/lib/session";
import { coreApi, claimsFromSession } from "@/lib/core-api";
import { modelTaskLabel } from "@/lib/model-tasks";
import { InstructorNav } from "@/components/instructor-nav";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type Profile = { name: string; provider: string; model: string };
type TaskRow = {
  task: string;
  default_profile: string;
  binding: { profile: string; updated_at: string; updated_by: string } | null;
  last_call: { use_case: string; provider: string; model: string; status: string; called_at: string | null } | null;
  recent: { hours: number; ok: number; error: number };
};
type Bindings = { profiles: Profile[]; tasks: TaskRow[]; ttl_seconds: number };

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

function profileText(profiles: Profile[], name: string) {
  const found = profiles.find((p) => p.name === name);
  return found ? `${found.name} · ${found.model}` : name;
}

function TaskCard({ row, profiles, sid }: { row: TaskRow; profiles: Profile[]; sid?: string }) {
  const label = modelTaskLabel(row.task);
  const last = row.last_call;
  // Có lựa chọn mới mà chưa job nào chạy sau đó thì "lần gọi gần nhất" vẫn là model cũ.
  const notUsedYet =
    row.binding && (!last?.called_at || new Date(last.called_at) < new Date(row.binding.updated_at));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="font-semibold">{label.title}</p>
        {label.detail && <p className="mt-1 text-sm text-slate-600">{label.detail}</p>}
      </div>
      <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-slate-500">Đang chọn: </span>
            {row.binding ? (
              <span className="font-medium">{profileText(profiles, row.binding.profile)}</span>
            ) : (
              <span className="font-medium">Mặc định của worker</span>
            )}
          </p>
          <p className="text-slate-500">
            {row.binding
              ? `Đổi bởi ${row.binding.updated_by} lúc ${formatTime(row.binding.updated_at)}.`
              : `Theo LLM_PROFILE__${row.task.toUpperCase()} trên máy chạy worker; không đặt thì là ${row.default_profile}.`}
          </p>
          <p>
            <span className="text-slate-500">Lần gọi gần nhất: </span>
            {last ? (
              <>
                {last.model}{" "}
                <span className={last.status === "OK" ? "text-emerald-700" : "font-medium text-red-700"}>
                  {last.status}
                </span>{" "}
                <span className="text-slate-500">· {formatTime(last.called_at)}</span>
              </>
            ) : (
              <span className="text-slate-500">chưa có</span>
            )}
          </p>
          <p className="text-slate-500">
            {row.recent.hours} giờ qua: {row.recent.ok} thành công ·{" "}
            <span className={row.recent.error > 0 ? "font-medium text-red-700" : undefined}>
              {row.recent.error} lỗi
            </span>
          </p>
          {notUsedYet && (
            <p className="text-amber-700">Chưa có job nào chạy sau lần đổi này.</p>
          )}
        </div>
        <form method="post" action={withSid("/api/model-bindings", sid)} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="task" value={row.task} />
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-500">Model</span>
            <select
              name="profile"
              defaultValue={row.binding?.profile ?? ""}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Mặc định của worker</option>
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} · {p.model} ({p.provider})
                </option>
              ))}
            </select>
          </label>
          <button className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Lưu
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function ManageModels({ searchParams }: Props) {
  const sp = await searchParams;
  const access = await readManageSession(sp.sid);
  if (access.status === "expired") {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  if (access.status === "forbidden" || access.active.session.role !== "administrator") {
    return <main className="p-8 text-slate-700">Chỉ admin của LMS được chọn model AI.</main>;
  }

  const { sid, session } = access.active;
  let data: Bindings | null = null;
  let error = "";
  try {
    data = await coreApi.listModelBindings<Bindings>(claimsFromSession(session));
  } catch (err) {
    error = err instanceof Error ? err.message : "Không tải được cấu hình model.";
  }

  const actionError = first(sp.reviewError);
  const actionSuccess = first(sp.reviewSuccess);
  const chosen = (task: string) => {
    const row = data?.tasks.find((t) => t.task === task);
    return row ? row.binding?.profile ?? row.default_profile : null;
  };
  const writer = chosen("quiz_generation");
  const judgeIsWriter = writer !== null && writer === chosen("quiz_verification");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Admin</p>
          <h1 className="text-xl font-semibold">Model AI</h1>
          <p className="mt-1 text-sm text-slate-600">
            Chọn model cho từng việc AI làm. Áp dụng cho mọi khoá học; job mới dùng model mới sau tối đa{" "}
            {data?.ttl_seconds ?? 30} giây, không cần khởi động lại worker. API key không nằm ở đây: đặt trong{" "}
            <code>.env</code> hoặc Infisical.
          </p>
          <InstructorNav active="models" courseId={session.courseId} sid={sid} isAdmin />
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {actionSuccess && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>
        )}
        {judgeIsWriter && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Model kiểm chứng đang trùng model viết nội dung ({writer}). Model vừa viết một câu sai thường chấm câu đó là
            đúng, nên chọn hai model khác nhau.
          </p>
        )}
        {data?.tasks.map((row) => (
          <TaskCard key={row.task} row={row} profiles={data.profiles} sid={sid} />
        ))}
      </section>
    </main>
  );
}
