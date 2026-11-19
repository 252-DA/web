"use client";

import { useState, type FormEvent } from "react";
import {
  ROLE_LABELS,
  VISIBILITY_LABELS,
  type BankRelation,
  type BankVisibility,
  type QuestionBankSummary,
} from "@/lib/question-bank";

const GROUPS: Array<{ key: BankRelation; title: string; subtitle: string }> = [
  { key: "mine", title: "Của tôi", subtitle: "Các ngân hàng bạn trực tiếp tạo và quản lý" },
  { key: "course", title: "Của khoá", subtitle: "Ngân hàng chung và ngân hàng trong các khoá bạn phụ trách" },
  { key: "shared", title: "Được chia sẻ", subtitle: "Ngân hàng giảng viên khác cấp quyền trực tiếp cho bạn hoặc khoá" },
  { key: "subject", title: "Cùng môn", subtitle: "Ngân hàng để phạm vi môn học để bạn lấy câu vào đề hoặc Fork" },
  { key: "admin", title: "Quản trị hệ thống", subtitle: "Các ngân hàng khác trên toàn hệ thống" },
];

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function BanksListClient({
  sid,
  courseId,
  courseSubjectCode,
  initialBanks,
}: {
  sid?: string;
  courseId: string;
  courseSubjectCode: string | null;
  initialBanks: QuestionBankSummary[];
}) {
  const [banks, setBanks] = useState(initialBanks);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<BankVisibility>("COURSE");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch(withSid("/api/banks", sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, title, description: description || null, visibility }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Không tạo được ngân hàng.");
      }
      const listRes = await fetch(withSid(`/api/banks?courseId=${encodeURIComponent(courseId)}`, sid), {
        cache: "no-store",
      });
      if (listRes.ok) {
        setBanks((await listRes.json()) as QuestionBankSummary[]);
      }
      setTitle("");
      setDescription("");
      setVisibility("COURSE");
      setShowCreate(false);
      setMessage({ kind: "success", text: `Đã tạo ngân hàng “${payload.title}”.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Không tạo được ngân hàng." });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Hiện có <span className="font-semibold text-slate-900">{banks.length}</span> ngân hàng câu hỏi bạn được phép truy cập.
        </p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {showCreate ? "Đóng biểu mẫu" : "+ Tạo ngân hàng mới"}
        </button>
      </div>

      {message && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            message.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {message.text}
        </p>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Tạo ngân hàng câu hỏi cho khoá hiện tại</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Tên ngân hàng
              <input
                required
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Ngân hàng ôn tập giữa kỳ"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Phạm vi chia sẻ
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as BankVisibility)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              >
                <option value="PRIVATE">{VISIBILITY_LABELS.PRIVATE}</option>
                <option value="COURSE">{VISIBILITY_LABELS.COURSE}</option>
                <option value="SUBJECT" disabled={!courseSubjectCode}>
                  {VISIBILITY_LABELS.SUBJECT}
                  {!courseSubjectCode ? " (chưa nạp đề cương để có mã môn)" : ""}
                </option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Mô tả (tuỳ chọn)
            <textarea
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {creating ? "Đang tạo…" : "Tạo ngân hàng"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}

      {GROUPS.map((group) => {
        const items = banks.filter((b) => b.relation === group.key);
        if (!items.length && group.key === "admin") return null;
        return (
          <section key={group.key} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {group.title} <span className="ml-1 text-sm font-normal text-slate-500">({items.length})</span>
              </h2>
              <p className="text-xs text-slate-500">{group.subtitle}</p>
            </div>
            {!items.length ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                Chưa có ngân hàng nào trong nhóm này.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((bank) => (
                  <a
                    key={bank.bank_id}
                    href={withSid(`/manage/banks/${bank.bank_id}`, sid)}
                    className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">{bank.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {bank.home_course.name}
                          {bank.subject_code ? ` · ${bank.subject_code}` : ""}
                          {bank.is_current_course ? " · Khoá đang mở" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                        {bank.is_course_default && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Mặc định</span>
                        )}
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                          {bank.visibility}
                        </span>
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">{bank.role}</span>
                      </div>
                    </div>
                    {bank.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{bank.description}</p>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                      <span className="tabular-nums">
                        <strong className="text-emerald-700">{bank.counts.usable}</strong> sẵn sàng ·{" "}
                        <strong>{bank.counts.total}</strong> câu
                        {bank.counts.retired > 0 ? ` · ${bank.counts.retired} ngừng dùng` : ""}
                      </span>
                      <span className="text-slate-400">{ROLE_LABELS[bank.role]}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
