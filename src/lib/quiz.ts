export type QuizChoice = {
  key: string;
  label: string;
  value: unknown;
};

export type ContentGenerationRequest = {
  request_id: string;
  course_id: string;
  type: string;
  scope: unknown;
  status: string;
  generated_count: number;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type LearningOutcomeOption = {
  lo_id: string;
  code: string;
  statement_vi: string;
  bloom_level: number;
  chapter_title?: string;
};

export function answerKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function quizChoices(options: unknown): QuizChoice[] {
  if (Array.isArray(options)) {
    return options.map((option, index) => {
      if (option && typeof option === "object") {
        const record = option as Record<string, unknown>;
        const label = String(record.text ?? record.label ?? record.value ?? `Lựa chọn ${index + 1}`);
        const value = record.value ?? record.text ?? record.label ?? option;
        return { key: String(record.id ?? record.key ?? index), label, value };
      }

      return {
        key: String(index),
        label: String(option ?? ""),
        value: option,
      };
    });
  }

  if (options && typeof options === "object") {
    return Object.entries(options).map(([key, value]) => ({
      key,
      label: `${key}. ${String(value)}`,
      value: key,
    }));
  }

  return [];
}

export function bloomLabel(level: number | null | undefined): string {
  return (
    {
      1: "Ghi nhớ",
      2: "Hiểu",
      3: "Vận dụng",
      4: "Phân tích",
      5: "Đánh giá",
      6: "Sáng tạo",
    } as Record<number, string>
  )[level ?? 0] ?? "Theo chuẩn đầu ra";
}

export function requestTarget(scope: unknown): string {
  if (!scope || typeof scope !== "object") return "Learning outcome";
  const value = scope as Record<string, unknown>;
  return String(
    value.target_code ?? value.targetCode ?? value.lo_code ?? value.loCode ?? "Learning outcome",
  );
}

/**
 * Quá bao lâu thì một yêu cầu QUEUED/RUNNING bị coi là treo.
 *
 * Không có endpoint huỷ, và không job nào dọn dòng treo, nên một yêu cầu kẹt sẽ
 * khoá vĩnh viễn việc sinh quiz của cả khoá học: `POST /api/content-generations`
 * trả 409 và nút "Sinh quiz" bị disable. Quá ngưỡng này thì coi như không còn
 * chặn — worker vẫn được phép ghi kết quả về sau, chỉ là giảng viên không phải
 * chờ nó nữa.
 *
 * 15 phút: một yêu cầu chạy hết 5 lượt retry của BullMQ (kèm backoff luỹ thừa),
 * mỗi lượt một lần sinh cộng tối đa ba lần verify, vẫn nằm gọn trong ngưỡng này.
 */
export const STALE_REQUEST_MS = 15 * 60_000;

const ACTIVE_REQUEST_STATUSES = new Set(["QUEUED", "RUNNING"]);

type RequestProgress = {
  status: string;
  updated_at?: string | null;
  created_at?: string | null;
};

/** Mốc tiến triển gần nhất; `updated_at` đổi theo mỗi lần worker chuyển trạng thái. */
function lastProgressAt(request: RequestProgress): number | null {
  for (const value of [request.updated_at, request.created_at]) {
    if (typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Yêu cầu đang chạy nhưng đã quá lâu không có tiến triển.
 *
 * Không đọc được mốc thời gian thì **không** coi là treo: thà bắt chờ còn hơn
 * cho chạy song song vì một dòng dữ liệu dị thường.
 */
export function isRequestStale(request: RequestProgress, now: number = Date.now()): boolean {
  if (!ACTIVE_REQUEST_STATUSES.has(request.status)) return false;
  const progressedAt = lastProgressAt(request);
  if (progressedAt === null) return false;
  return now - progressedAt > STALE_REQUEST_MS;
}

/** Còn đang chiếm chỗ: QUEUED/RUNNING và chưa quá hạn. */
export function isActiveRequest(request: RequestProgress, now: number = Date.now()): boolean {
  return ACTIVE_REQUEST_STATUSES.has(request.status) && !isRequestStale(request, now);
}
