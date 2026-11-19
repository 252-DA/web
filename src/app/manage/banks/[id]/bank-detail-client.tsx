"use client";

import { useState, type FormEvent } from "react";
import { AnswerReview } from "@/components/answer-review";
import { QuestionEditFields } from "@/components/question-edit-fields";
import {
  formatOriginAndModel,
  ITEM_STATUS_LABELS,
  ORIGIN_LABELS,
  ROLE_LABELS,
  VISIBILITY_LABELS,
  type BankQuizItem,
  type BankRole,
  type BankShareCandidates,
  type QuestionBankDetail,
  type QuizItemVersionsResponse,
} from "@/lib/question-bank";
import { editFromForm, QUESTION_TYPES, questionTypeLabel, type QuestionType } from "@/lib/question-types";
import { bloomLabel } from "@/lib/quiz";

type LoOption = { lo_id: string; code: string; statement_vi: string };
type ForkTarget = { bank_id: string; title: string; course_name: string; is_current_course: boolean };
type Notice = { kind: "error" | "success" | "info"; text: string; linkHref?: string; linkLabel?: string } | null;

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function BankDetailClient({
  sid,
  initialBank,
  initialItems,
  loOptions,
  forkTargets,
  initialCandidates,
}: {
  sid?: string;
  initialBank: QuestionBankDetail;
  initialItems: BankQuizItem[];
  loOptions: LoOption[];
  forkTargets: ForkTarget[];
  initialCandidates: BankShareCandidates | null;
}) {
  const [bank, setBank] = useState(initialBank);
  const [items, setItems] = useState(initialItems);
  const [candidates] = useState(initialCandidates);
  const [notice, setNotice] = useState<Notice>(null);

  // Bộ lọc
  const [filterLo, setFilterLo] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOrigin, setFilterOrigin] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [loadingItems, setLoadingItems] = useState(false);

  // Chỉnh sửa thông tin ngân hàng
  const [showEditBank, setShowEditBank] = useState(false);
  const [bankTitle, setBankTitle] = useState(initialBank.title);
  const [bankDescription, setBankDescription] = useState(initialBank.description ?? "");
  const [bankVisibility, setBankVisibility] = useState(initialBank.visibility);
  const [savingBank, setSavingBank] = useState(false);

  // Chia sẻ
  const [showShare, setShowShare] = useState(false);
  const [shareTargetType, setShareTargetType] = useState<"USER" | "COURSE">("USER");
  const [shareTargetId, setShareTargetId] = useState(
    initialCandidates?.users[0]?.user_id || initialCandidates?.courses[0]?.course_id || "",
  );
  const [shareRole, setShareRole] = useState<BankRole>("USE");
  const [sharing, setSharing] = useState(false);

  // Thêm câu viết tay
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [newType, setNewType] = useState<QuestionType>("MCQ_SINGLE");
  const [newLoId, setNewLoId] = useState("");
  const [newBloom, setNewBloom] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);

  // Fork
  const [forkQuizId, setForkQuizId] = useState<string | null>(null);
  const [forkTargetBankId, setForkTargetBankId] = useState(forkTargets[0]?.bank_id ?? "");
  const [forking, setForking] = useState(false);

  // Lịch sử phiên bản
  const [versionsData, setVersionsData] = useState<QuizItemVersionsResponse | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Theo câu
  const [busyId, setBusyId] = useState<string | null>(null);

  const canEdit = bank.role === "EDIT";
  const canUse = bank.role === "EDIT" || bank.role === "USE";

  async function reloadItems(overrides?: {
    lo?: string;
    type?: string;
    status?: string;
    origin?: string;
    search?: string;
  }) {
    setLoadingItems(true);
    try {
      const qs = new URLSearchParams();
      const lo = overrides?.lo ?? filterLo;
      const type = overrides?.type ?? filterType;
      const status = overrides?.status ?? filterStatus;
      const origin = overrides?.origin ?? filterOrigin;
      const search = overrides?.search ?? filterSearch;
      if (lo) qs.set("lo", lo);
      if (type) qs.set("type", type);
      if (status) qs.set("status", status);
      if (origin) qs.set("origin", origin);
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}/items?${qs}`, sid), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không lọc được câu hỏi.");
      setBank(data.bank as QuestionBankDetail);
      setItems(data.items as BankQuizItem[]);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không tải lại được danh sách." });
    } finally {
      setLoadingItems(false);
    }
  }

  async function handleSaveBank(event: FormEvent) {
    event.preventDefault();
    setSavingBank(true);
    setNotice(null);
    try {
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}`, sid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bankTitle,
          description: bankDescription || null,
          ...(bank.can_change_visibility ? { visibility: bankVisibility } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không cập nhật được ngân hàng.");
      setShowEditBank(false);
      await reloadItems();
      setNotice({ kind: "success", text: "Đã lưu thông tin ngân hàng." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không cập nhật được ngân hàng." });
    } finally {
      setSavingBank(false);
    }
  }

  async function handleShare(event: FormEvent) {
    event.preventDefault();
    if (!shareTargetId) return;
    setSharing(true);
    setNotice(null);
    try {
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}/shares`, sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          granteeType: shareTargetType,
          granteeId: shareTargetId,
          role: shareRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không chia sẻ được ngân hàng.");
      await reloadItems();
      setNotice({ kind: "success", text: "Đã cập nhật quyền chia sẻ." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không chia sẻ được." });
    } finally {
      setSharing(false);
    }
  }

  async function handleUnshare(granteeType: string, granteeId: string) {
    setSharing(true);
    setNotice(null);
    try {
      const qs = new URLSearchParams({ granteeType, granteeId });
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}/shares?${qs}`, sid), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thu hồi được chia sẻ.");
      await reloadItems();
      setNotice({ kind: "success", text: "Đã thu hồi quyền chia sẻ." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không thu hồi được chia sẻ." });
    } finally {
      setSharing(false);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingItem(true);
    setNotice(null);
    try {
      const form = new FormData(event.currentTarget);
      const parsed = editFromForm(newType, form);
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}/items`, sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          question: parsed.question,
          options: parsed.options,
          correct_answer: parsed.correct_answer,
          explanation: parsed.explanation || null,
          loId: newLoId || null,
          bloomLevel: newBloom ? Number(newBloom) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được câu hỏi.");
      event.currentTarget.reset();
      setShowCreateItem(false);
      await reloadItems();
      setNotice({ kind: "success", text: "Đã thêm câu hỏi viết tay (trạng thái Đã duyệt)." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không thêm được câu hỏi." });
    } finally {
      setCreatingItem(false);
    }
  }

  async function handleRetire(item: BankQuizItem) {
    const restore = item.status === "RETIRED";
    setBusyId(item.quiz_id);
    setNotice(null);
    try {
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}/items/${item.quiz_id}/retire`, sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không cập nhật được trạng thái.");
      await reloadItems();
      setNotice({
        kind: "success",
        text: restore ? "Đã khôi phục câu hỏi về trạng thái Đã duyệt." : "Đã ngừng dùng câu hỏi.",
      });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Thao tác thất bại." });
    } finally {
      setBusyId(null);
    }
  }

  async function handleFork(event: FormEvent) {
    event.preventDefault();
    if (!forkQuizId || !forkTargetBankId) return;
    setForking(true);
    setNotice(null);
    try {
      const res = await fetch(withSid(`/api/banks/${bank.bank_id}/items/${forkQuizId}/fork`, sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetBankId: forkTargetBankId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không nhân bản được câu hỏi.");
      const warnParts: string[] = [];
      if (!data.lo_mapped && data.unmapped_lo_code) {
        warnParts.push(`khoá đích chưa có LO ${data.unmapped_lo_code} nên đã để trống LO`);
      } else if (data.lo_statement_differs) {
        warnParts.push("LO cùng mã ở khoá đích có phát biểu khác, hãy kiểm tra lại");
      }
      setNotice({
        kind: warnParts.length ? "info" : "success",
        text: `Đã nhân bản câu sang ngân hàng đích${warnParts.length ? ` (${warnParts.join("; ")})` : ""}.`,
        linkHref: withSid(`/manage/banks/${data.target_bank_id}`, sid),
        linkLabel: "Mở ngân hàng đích →",
      });
      setForkQuizId(null);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không nhân bản được." });
    } finally {
      setForking(false);
    }
  }

  async function openVersions(quizId: string) {
    setVersionsLoading(true);
    setVersionsData(null);
    try {
      const res = await fetch(withSid(`/api/quiz-items/${quizId}/versions`, sid), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tải được lịch sử phiên bản.");
      setVersionsData(data as QuizItemVersionsResponse);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Không tải được lịch sử phiên bản." });
    } finally {
      setVersionsLoading(false);
    }
  }

  const candidateOptions =
    shareTargetType === "USER"
      ? (candidates?.users ?? []).map((u) => ({
          id: u.user_id,
          label: u.courses.length ? `${u.display_name} (${u.courses.join(", ")})` : u.display_name,
        }))
      : (candidates?.courses ?? []).map((c) => ({ id: c.course_id, label: c.name }));

  return (
    <div className="space-y-5">
      {/* Thanh thông tin & hành động ngân hàng */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
            Phạm vi: {VISIBILITY_LABELS[bank.visibility]}
          </span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-800">
            Quyền: {ROLE_LABELS[bank.role]}
          </span>
          {bank.is_course_default && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Ngân hàng mặc định</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setShowEditBank((v) => !v)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-500"
              >
                Cài đặt
              </button>
              <button
                type="button"
                onClick={() => setShowShare((v) => !v)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-500"
              >
                Chia sẻ {bank.shares?.length ? `(${bank.shares.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateItem((v) => !v)}
                className="rounded-lg bg-slate-950 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                + Thêm câu hỏi
              </button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm ${
            notice.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : notice.kind === "info"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          <span>
            {notice.text}{" "}
            {notice.linkHref && (
              <a href={notice.linkHref} className="font-semibold underline">
                {notice.linkLabel}
              </a>
            )}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs opacity-60 hover:opacity-100">
            Đóng
          </button>
        </div>
      )}

      {showEditBank && canEdit && (
        <form onSubmit={handleSaveBank} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Thông tin ngân hàng</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Tên ngân hàng
              <input
                required
                maxLength={255}
                value={bankTitle}
                onChange={(e) => setBankTitle(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Phạm vi chia sẻ
              <select
                value={bankVisibility}
                disabled={!bank.can_change_visibility}
                onChange={(e) => setBankVisibility(e.target.value as QuestionBankDetail["visibility"])}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="PRIVATE" disabled={bank.is_course_default}>
                  {VISIBILITY_LABELS.PRIVATE}
                </option>
                <option value="COURSE">{VISIBILITY_LABELS.COURSE}</option>
                <option value="SUBJECT" disabled={!bank.subject_code}>
                  {VISIBILITY_LABELS.SUBJECT}
                  {!bank.subject_code ? " (chưa có mã môn)" : ""}
                </option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Mô tả
            <textarea
              rows={2}
              maxLength={2000}
              value={bankDescription}
              onChange={(e) => setBankDescription(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingBank}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {savingBank ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
            <button
              type="button"
              onClick={() => setShowEditBank(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Đóng
            </button>
          </div>
        </form>
      )}

      {showShare && canEdit && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold">Chia sẻ ngân hàng</h2>
            <p className="text-xs text-slate-500">
              Cấp quyền trực tiếp cho giảng viên hoặc khoá học khác trong cùng môn{" "}
              {candidates?.subject_code ? `(${candidates.subject_code})` : ""}.
            </p>
          </div>

          {bank.shares && bank.shares.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {bank.shares.map((s) => (
                <li
                  key={`${s.grantee_type}:${s.grantee_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      {s.grantee_type === "USER" ? "Giảng viên" : "Khoá học"}
                    </span>
                    <span className="font-medium">{s.grantee_label ?? s.grantee_id}</span>
                    <span className="ml-2 text-xs text-slate-500">· {ROLE_LABELS[s.role]}</span>
                  </span>
                  <button
                    type="button"
                    disabled={sharing}
                    onClick={() => void handleUnshare(s.grantee_type, s.grantee_id)}
                    className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Thu hồi
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleShare} className="grid gap-3 sm:grid-cols-[150px_1fr_200px_auto] sm:items-end">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Đối tượng
              <select
                value={shareTargetType}
                onChange={(e) => {
                  const nextType = e.target.value as "USER" | "COURSE";
                  setShareTargetType(nextType);
                  const firstOption =
                    nextType === "USER" ? candidates?.users[0]?.user_id : candidates?.courses[0]?.course_id;
                  setShareTargetId(firstOption ?? "");
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal text-slate-900"
              >
                <option value="USER">Giảng viên</option>
                <option value="COURSE">Khoá học</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Chọn người nhận / khoá
              {candidateOptions.length > 0 ? (
                <select
                  value={shareTargetId}
                  onChange={(e) => setShareTargetId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal text-slate-900"
                >
                  {candidateOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={shareTargetId}
                  onChange={(e) => setShareTargetId(e.target.value)}
                  placeholder="Chưa có ứng viên cùng môn (nhập UUID nếu có)"
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-normal text-slate-900"
                />
              )}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Quyền
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as BankRole)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal text-slate-900"
              >
                <option value="VIEW">{ROLE_LABELS.VIEW}</option>
                <option value="USE">{ROLE_LABELS.USE}</option>
                <option value="EDIT">{ROLE_LABELS.EDIT}</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={sharing || !shareTargetId}
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Chia sẻ
            </button>
          </form>
        </section>
      )}

      {showCreateItem && canEdit && (
        <form
          onSubmit={handleCreateItem}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold">Thêm câu hỏi viết tay</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              Kiểu câu hỏi
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as QuestionType)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Chuẩn đầu ra (LO)
              <select
                value={newLoId}
                onChange={(e) => setNewLoId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Chưa gắn LO</option>
                {loOptions.map((lo) => (
                  <option key={lo.lo_id} value={lo.lo_id}>
                    {lo.code} — {lo.statement_vi}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Mức Bloom
              <select
                value={newBloom}
                onChange={(e) => setNewBloom(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Không đặt</option>
                {[1, 2, 3, 4, 5, 6].map((b) => (
                  <option key={b} value={b}>
                    {bloomLabel(b)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Nội dung câu hỏi
            <textarea
              name="question"
              required
              rows={3}
              placeholder={newType === "FILL_BLANK" ? "VD: Hệ thống tệp của Hadoop gọi là ____." : "Nhập nội dung câu hỏi…"}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <QuestionEditFields
            key={newType}
            quiz={{
              type: newType,
              options: null,
              correct_answer: newType === "TRUE_FALSE" ? "Đúng" : null,
            }}
          />
          <label className="grid gap-1 text-sm">
            Giải thích (tuỳ chọn)
            <textarea name="explanation" rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creatingItem}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {creatingItem ? "Đang lưu…" : "Lưu câu hỏi"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateItem(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}

      {/* Bộ lọc câu hỏi */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void reloadItems();
        }}
        className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <select
          aria-label="Lọc LO"
          value={filterLo}
          onChange={(e) => {
            setFilterLo(e.target.value);
            void reloadItems({ lo: e.target.value });
          }}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">Mọi LO</option>
          {loOptions.map((lo) => (
            <option key={lo.lo_id} value={lo.lo_id}>
              {lo.code}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc kiểu câu"
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            void reloadItems({ type: e.target.value });
          }}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">Mọi kiểu câu</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc trạng thái"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            void reloadItems({ status: e.target.value });
          }}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">Đang hoạt động (trừ ngừng dùng)</option>
          {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc nguồn gốc"
          value={filterOrigin}
          onChange={(e) => {
            setFilterOrigin(e.target.value);
            void reloadItems({ origin: e.target.value });
          }}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">Mọi nguồn gốc</option>
          {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="Tìm nội dung câu hỏi"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Tìm nội dung…"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loadingItems}
          className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          {loadingItems ? "Đang tải…" : "Tìm kiếm"}
        </button>
      </form>

      {/* Danh sách câu hỏi */}
      <p className="text-sm text-slate-600">
        Hiển thị <strong className="text-slate-900">{items.length}</strong> câu hỏi
      </p>

      {!items.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Chưa có câu hỏi nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const duplicateOf =
              item.provenance && typeof item.provenance.duplicate_of === "string"
                ? item.provenance.duplicate_of
                : null;
            return (
              <article key={item.quiz_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-medium text-slate-700">
                    {formatOriginAndModel(item.origin, item.provenance)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700">
                    {questionTypeLabel(item.type)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-800">
                    {ITEM_STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  {item.learning_outcomes?.code && (
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 font-medium text-sky-800">
                      {item.learning_outcomes.code}
                    </span>
                  )}
                  {item.bloom_level && (
                    <span className="text-slate-500">· {bloomLabel(item.bloom_level)}</span>
                  )}
                  {item.current_version && (
                    <span className="text-slate-500">· v{item.current_version.version_no}</span>
                  )}
                  {duplicateOf && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                      Trùng văn bản với câu khác trong ngân hàng
                    </span>
                  )}
                </div>

                <h3 className="mt-3 text-base font-semibold text-slate-950">{item.question}</h3>

                <div className="mt-3">
                  <AnswerReview type={item.type} options={item.options} correctAnswer={item.correct_answer} compact />
                </div>

                {item.explanation && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{item.explanation}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openVersions(item.quiz_id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-500"
                  >
                    Lịch sử phiên bản
                  </button>
                  {canUse && forkTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setForkQuizId(forkQuizId === item.quiz_id ? null : item.quiz_id)}
                      className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                    >
                      Nhân bản (Fork)
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busyId === item.quiz_id}
                      onClick={() => void handleRetire(item)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-40"
                    >
                      {item.status === "RETIRED" ? "Khôi phục" : "Ngừng dùng"}
                    </button>
                  )}
                </div>

                {forkQuizId === item.quiz_id && forkTargets.length > 0 && (
                  <form
                    onSubmit={handleFork}
                    className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3"
                  >
                    <label className="grid flex-1 gap-1 text-xs font-medium text-slate-700">
                      Chọn ngân hàng đích (bạn có quyền EDIT)
                      <select
                        value={forkTargetBankId}
                        onChange={(e) => setForkTargetBankId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-900"
                      >
                        {forkTargets.map((t) => (
                          <option key={t.bank_id} value={t.bank_id}>
                            {t.title} · {t.course_name}
                            {t.is_current_course ? " (khoá đang mở)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={forking}
                      className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                    >
                      {forking ? "Đang nhân bản…" : "Xác nhận Fork"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForkQuizId(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    >
                      Huỷ
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Modal lịch sử phiên bản */}
      {(versionsLoading || versionsData) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lịch sử phiên bản câu hỏi"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-lg font-semibold">Lịch sử phiên bản</h2>
              <button
                type="button"
                onClick={() => {
                  setVersionsData(null);
                  setVersionsLoading(false);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
            {versionsLoading ? (
              <p className="py-6 text-sm text-slate-500">Đang tải lịch sử phiên bản…</p>
            ) : (
              versionsData && (
                <div className="mt-4 space-y-4">
                  {versionsData.forked_from_version_id && (
                    <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      Câu này được nhân bản từ phiên bản gốc: <code>{versionsData.forked_from_version_id}</code>
                    </p>
                  )}
                  {versionsData.versions.map((v) => (
                    <div key={v.version_id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-900">
                          Phiên bản v{v.version_no}
                          {v.version_id === versionsData.current_version_id ? " (Hiện tại)" : ""}
                        </span>
                        <span>
                          {v.creator?.display_name ?? "Hệ thống"} ·{" "}
                          {new Date(v.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-950">{v.question}</p>
                      <div className="mt-2">
                        <AnswerReview type={v.type} options={v.options} correctAnswer={v.correct_answer} compact />
                      </div>
                      {v.explanation && <p className="mt-2 text-xs text-slate-600">{v.explanation}</p>}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
