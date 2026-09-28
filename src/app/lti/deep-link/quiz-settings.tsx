"use client";

import { useState } from "react";

/** Cài đặt bài khi thêm quiz vào module: Luyện tập hoặc Kiểm tra. */
export type QuizSettingsDraft = {
  mode: "practice" | "exam";
  pointsPossible: string;
  maxAttempts: string; // "" = không giới hạn
  timeLimitMinutes: string; // "" = không giới hạn
  shuffle: boolean;
  // Giá trị <input type="datetime-local">: giờ địa phương của giảng viên.
  dueAt: string;
  availableFrom: string;
  availableUntil: string;
};

export const DEFAULT_SETTINGS: QuizSettingsDraft = {
  mode: "practice",
  pointsPossible: "100",
  maxAttempts: "1",
  timeLimitMinutes: "30",
  shuffle: true,
  dueAt: "",
  availableFrom: "",
  availableUntil: "",
};

const field =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

/** datetime-local → ISO UTC. Trình duyệt hiểu chuỗi không có múi giờ là giờ địa phương. */
function iso(local: string) {
  if (!local) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function settingsProblem(s: QuizSettingsDraft): string | null {
  const points = Number(s.pointsPossible);
  if (!Number.isFinite(points) || points <= 0 || points > 1000) return "Điểm tối đa từ 0 đến 1000.";
  if (s.mode === "practice") return null;
  if (!s.dueAt) return "Bài kiểm tra cần hạn nộp.";
  const due = new Date(s.dueAt).getTime();
  if (due <= Date.now()) return "Hạn nộp phải ở tương lai.";
  const from = s.availableFrom ? new Date(s.availableFrom).getTime() : null;
  const until = s.availableUntil ? new Date(s.availableUntil).getTime() : null;
  if (from !== null && until !== null && from >= until) return "Giờ mở bài phải trước giờ đóng bài.";
  if (until !== null && due > until) return "Hạn nộp không được sau giờ đóng bài.";
  if (from !== null && due <= from) return "Hạn nộp phải sau giờ mở bài.";
  if (s.timeLimitMinutes && !(Number.isInteger(Number(s.timeLimitMinutes)) && Number(s.timeLimitMinutes) >= 1 && Number(s.timeLimitMinutes) <= 600))
    return "Thời gian làm bài từ 1 đến 600 phút.";
  return null;
}

/** Cài đặt gửi dạng JSON (trang Soạn đề); core-api kiểm tra lại toàn bộ. */
export function settingsPayload(value: QuizSettingsDraft) {
  const exam = value.mode === "exam";
  return {
    mode: value.mode,
    pointsPossible: value.pointsPossible,
    ...(exam
      ? {
          maxAttempts: value.maxAttempts,
          timeLimitMinutes: value.timeLimitMinutes,
          shuffle: value.shuffle,
          dueAt: iso(value.dueAt),
          availableFrom: iso(value.availableFrom),
          availableUntil: iso(value.availableUntil),
        }
      : {}),
  };
}

/** Các ô ẩn gửi kèm form trả về Canvas (thời điểm đã đổi sang ISO UTC). */
export function SettingsInputs({ value }: { value: QuizSettingsDraft }) {
  const exam = value.mode === "exam";
  return (
    <>
      <input type="hidden" name="mode" value={value.mode} />
      <input type="hidden" name="pointsPossible" value={value.pointsPossible} />
      {exam && (
        <>
          <input type="hidden" name="maxAttempts" value={value.maxAttempts} />
          <input type="hidden" name="timeLimitMinutes" value={value.timeLimitMinutes} />
          <input type="hidden" name="shuffle" value={String(value.shuffle)} />
          <input type="hidden" name="dueAt" value={iso(value.dueAt)} />
          <input type="hidden" name="availableFrom" value={iso(value.availableFrom)} />
          <input type="hidden" name="availableUntil" value={iso(value.availableUntil)} />
        </>
      )}
    </>
  );
}

const shortTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function summary(value: QuizSettingsDraft) {
  if (value.mode === "practice") return "Làm lại không giới hạn · hiện đáp án ngay khi nộp";
  const due = value.dueAt ? new Date(value.dueAt) : null;
  return [
    value.timeLimitMinutes ? `${value.timeLimitMinutes} phút` : "không giới hạn giờ",
    value.maxAttempts ? `${value.maxAttempts} lần làm` : "không giới hạn lần làm",
    due && !Number.isNaN(due.getTime()) ? `hạn ${shortTime.format(due)}` : "chưa đặt hạn nộp",
    value.shuffle ? "xáo trộn" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Một dòng gọn trong footer của hộp thoại (iframe Canvas thấp); cài đặt chi
 * tiết của bài kiểm tra mở trong bảng phía trên khi cần.
 */
export function QuizSettingsBar({
  value,
  onChange,
  problem,
}: {
  value: QuizSettingsDraft;
  onChange: (next: QuizSettingsDraft) => void;
  problem: string | null;
}) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof QuizSettingsDraft>(key: K, v: QuizSettingsDraft[K]) =>
    onChange({ ...value, [key]: v });
  const exam = value.mode === "exam";
  return (
    <div className="space-y-2">
      {exam && open && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-4">
          <label className="grid gap-0.5">
            Số lần làm
            <select className={field} value={value.maxAttempts} onChange={(e) => set("maxAttempts", e.target.value)}>
              {["1", "2", "3", "5"].map((n) => (
                <option key={n} value={n}>
                  {n} lần
                </option>
              ))}
              <option value="">Không giới hạn</option>
            </select>
          </label>
          <label className="grid gap-0.5">
            Thời gian (phút)
            <input
              className={field}
              type="number"
              min={1}
              max={600}
              placeholder="Không giới hạn"
              value={value.timeLimitMinutes}
              onChange={(e) => set("timeLimitMinutes", e.target.value)}
            />
          </label>
          <label className="grid gap-0.5">
            Điểm tối đa
            <input
              className={field}
              type="number"
              min={1}
              max={1000}
              value={value.pointsPossible}
              onChange={(e) => set("pointsPossible", e.target.value)}
            />
          </label>
          <label className="flex items-end gap-1.5 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={value.shuffle} onChange={(e) => set("shuffle", e.target.checked)} />
            Xáo trộn câu và phương án
          </label>
          <label className="grid gap-0.5">
            <span>
              Hạn nộp <span className="text-red-600">*</span>
            </span>
            <input className={field} type="datetime-local" value={value.dueAt} onChange={(e) => set("dueAt", e.target.value)} />
          </label>
          <label className="grid gap-0.5">
            Mở bài từ (tuỳ chọn)
            <input
              className={field}
              type="datetime-local"
              value={value.availableFrom}
              onChange={(e) => set("availableFrom", e.target.value)}
            />
          </label>
          <label className="grid gap-0.5">
            Đóng bài lúc (tuỳ chọn)
            <input
              className={field}
              type="datetime-local"
              value={value.availableUntil}
              onChange={(e) => set("availableUntil", e.target.value)}
            />
          </label>
          <p className="self-end pb-1 text-slate-500">
            Để trống giờ đóng thì bài đóng đúng hạn nộp. Đáp án hiện cho sinh viên sau khi đóng bài.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-lg border border-slate-300" role="radiogroup" aria-label="Loại bài">
          {(
            [
              ["practice", "Luyện tập"],
              ["exam", "Kiểm tra"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={value.mode === mode}
              onClick={() => {
                set("mode", mode);
                if (mode === "exam" && !value.dueAt) setOpen(true);
              }}
              className={`px-3 py-1 font-medium ${value.mode === mode ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className={`min-w-0 truncate text-xs ${exam && problem ? "text-amber-800" : "text-slate-500"}`}>
          {exam && problem ? problem : summary(value)}
        </span>
        {exam && (
          <button type="button" className="text-xs font-medium text-sky-700 underline" onClick={() => setOpen((v) => !v)}>
            {open ? "Thu gọn" : "Cài đặt"}
          </button>
        )}
      </div>
    </div>
  );
}
