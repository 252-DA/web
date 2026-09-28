"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bloomLabel,
  isActiveRequest,
  isRequestStale,
  requestTarget,
  type ContentGenerationRequest,
  type LearningOutcomeOption,
} from "@/lib/quiz";

type Props = {
  courseId: string;
  sid?: string;
  learningOutcomes: LearningOutcomeOption[];
  initialRequests: ContentGenerationRequest[];
};

/** Chỉ dùng để nhận ra lúc một yêu cầu vừa chạy xong, không dùng để chặn. */
const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);
const REQUEST_LIMIT = 20;
const DISPLAY_LIMIT = 8;

function withSid(path: string, sid?: string) {
  if (!sid) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function statusMeta(request: ContentGenerationRequest) {
  if (isRequestStale(request)) {
    return {
      label: "Treo — không còn chặn",
      className: "border-orange-200 bg-orange-50 text-orange-900",
    };
  }
  switch (request.status) {
    case "RUNNING":
      return { label: "Đang sinh câu hỏi", className: "border-sky-200 bg-sky-50 text-sky-800" };
    case "SUCCEEDED":
      return { label: "Đã tạo xong", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    case "FAILED":
      return { label: "Sinh quiz thất bại", className: "border-red-200 bg-red-50 text-red-800" };
    case "CANCELLED":
      return { label: "Đã hủy", className: "border-slate-200 bg-slate-50 text-slate-700" };
    default:
      return { label: "Đang chờ xử lý", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }
}

function fixedDate(value: string | null) {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 16);
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || `Yêu cầu thất bại (HTTP ${response.status})`;
}

function isContentGenerationRequest(value: unknown): value is ContentGenerationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Partial<ContentGenerationRequest>;
  return (
    typeof request.request_id === "string" &&
    typeof request.course_id === "string" &&
    typeof request.type === "string" &&
    typeof request.status === "string" &&
    typeof request.generated_count === "number" &&
    (request.last_error === null || typeof request.last_error === "string") &&
    (request.created_at === null || typeof request.created_at === "string") &&
    (request.updated_at === null || typeof request.updated_at === "string")
  );
}

function requestTargetLabel(scope: unknown): string {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return "";
  const label = (scope as Record<string, unknown>).target_label;
  return typeof label === "string" ? label : "";
}

function quizRequests(value: unknown): ContentGenerationRequest[] {
  if (!Array.isArray(value)) throw new Error("Dữ liệu trạng thái sinh quiz không hợp lệ.");
  return value.filter(
    (request): request is ContentGenerationRequest =>
      isContentGenerationRequest(request) && request.type === "quiz",
  );
}

export function QuizGenerationPanel({
  courseId,
  sid,
  learningOutcomes,
  initialRequests,
}: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState(
    initialRequests.filter((request) => request.type === "quiz").slice(0, REQUEST_LIMIT),
  );
  const [targetId, setTargetId] = useState(learningOutcomes[0]?.lo_id ?? "");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const previousStatuses = useRef(new Map(initialRequests.map((item) => [item.request_id, item.status])));
  const selectedOutcome = learningOutcomes.find((outcome) => outcome.lo_id === targetId);

  const refreshRequests = useCallback(async (signal?: AbortSignal) => {
    const url = withSid(
      `/api/content-generations?courseId=${encodeURIComponent(courseId)}&type=quiz&limit=${REQUEST_LIMIT}`,
      sid,
    );
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(await responseError(response));

    const next = quizRequests(await response.json());
    const completed = next.some((item) => {
      const previous = previousStatuses.current.get(item.request_id);
      return previous && ACTIVE_STATUSES.has(previous) && !ACTIVE_STATUSES.has(item.status);
    });
    previousStatuses.current = new Map(next.map((item) => [item.request_id, item.status]));
    setRequests(next);
    if (completed) router.refresh();
  }, [courseId, router, sid]);

  // Treo quá lâu thì thôi chờ: không có nút huỷ, nên tính nó là "đang chạy"
  // đồng nghĩa với khoá cứng việc sinh quiz của khoá học này.
  const hasActiveRequest = requests.some((item) => isActiveRequest(item));

  useEffect(() => {
    if (!hasActiveRequest) return;
    const controller = new AbortController();
    let timer: number | undefined;

    async function poll() {
      try {
        await refreshRequests(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Không thể cập nhật trạng thái.");
        }
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 3000);
    }

    timer = window.setTimeout(poll, 3000);
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [hasActiveRequest, refreshRequests]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || hasActiveRequest) {
      setMessage("Một yêu cầu sinh quiz đang được xử lý. Vui lòng chờ hoàn tất.");
      return;
    }
    if (!targetId) {
      setMessage("Hãy chọn một chuẩn đầu ra trước khi sinh quiz.");
      return;
    }

    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withSid("/api/content-generations", sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, count }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const createdPayload: unknown = await response.json();
      if (!isContentGenerationRequest(createdPayload) || createdPayload.type !== "quiz") {
        throw new Error("Core API trả về yêu cầu sinh quiz không hợp lệ.");
      }
      const created = createdPayload;
      previousStatuses.current.set(created.request_id, created.status);
      setRequests((current) =>
        [created, ...current.filter((item) => item.request_id !== created.request_id)].slice(
          0,
          REQUEST_LIMIT,
        ),
      );
      setMessage("Đã đưa yêu cầu vào hàng đợi. Trang sẽ tự cập nhật khi có quiz mới.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo yêu cầu sinh quiz.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">AI quiz studio</p>
          <h2 className="mt-2 text-2xl font-semibold">Sinh quiz bám sát chuẩn đầu ra</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Chọn một learning outcome. Hệ thống truy xuất các đoạn tài liệu liên quan, sinh câu hỏi và đưa bản nháp vào inbox để giảng viên duyệt.
          </p>
        </div>
        <ol className="grid grid-cols-3 gap-2 text-center text-xs text-slate-300" aria-label="Quy trình sinh quiz">
          {[
            ["1", "Chọn LO"],
            ["2", "AI sinh quiz"],
            ["3", "Review & publish"],
          ].map(([step, label]) => (
            <li key={step} className="rounded-xl border border-white/15 bg-white/5 px-2 py-3">
              <span className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-sky-400 font-bold text-slate-950">{step}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={submit} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_170px_180px_auto] lg:items-end lg:p-6">
        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          Learning outcome
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            disabled={busy || learningOutcomes.length === 0}
            className="h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
          >
            {learningOutcomes.map((lo) => (
              <option key={lo.lo_id} value={lo.lo_id}>
                {lo.code} — {lo.statement_vi}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-800">
          Số câu hỏi
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <div className="grid gap-1.5 text-sm font-medium text-slate-800">
          Mức Bloom
          <div className="flex h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-700">
            {bloomLabel(selectedOutcome?.bloom_level)}
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || hasActiveRequest || learningOutcomes.length === 0}
          className="h-11 rounded-lg bg-sky-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Đang gửi…" : hasActiveRequest ? "Đang sinh quiz…" : "Sinh quiz"}
        </button>
      </form>

      {learningOutcomes.length === 0 && (
        <p className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:mx-6">
          Khóa học chưa có learning outcome. Hãy hoàn tất nhập curriculum và mapping tài liệu trước khi sinh quiz.
        </p>
      )}

      {message && (
        <p className="mx-5 mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 lg:mx-6" aria-live="polite">
          {message}
        </p>
      )}

      {requests.length > 0 && (
        <div className="border-t border-slate-200 px-5 py-4 lg:px-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Yêu cầu gần đây</h3>
            <button
              type="button"
              onClick={() => refreshRequests().catch((error) => setMessage(error instanceof Error ? error.message : String(error)))}
              className="text-sm font-medium text-sky-700 hover:text-sky-900"
            >
              Làm mới
            </button>
          </div>
          <div className="grid gap-2">
            {requests.slice(0, DISPLAY_LIMIT).map((request) => {
              const meta = statusMeta(request);
              const target = requestTarget(request.scope);
              const outcome = learningOutcomes.find(
                (item) => item.lo_id === target || item.code === target,
              );
              return (
                <div key={request.request_id} className="grid gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {outcome?.code || requestTargetLabel(request.scope) || target}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {fixedDate(request.created_at)} · ID {request.request_id.slice(0, 8)}
                    </p>
                    {request.last_error && <p className="mt-2 text-xs text-red-700">{request.last_error}</p>}
                  </div>
                  <div className="text-xs text-slate-500 md:text-right">
                    {request.status === "SUCCEEDED"
                      ? `${request.generated_count} câu đã tạo`
                      : bloomLabel(outcome?.bloom_level)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
