import { coreApi } from "@/lib/core-api";
import {
  assetProcessorEditAccess,
  assetProcessorFlowAccess,
  RUBRIC_ROWS,
  type EssayProcessor,
  type EssayRubricRow,
} from "@/lib/lti-asset-processor-session";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Rubric gợi ý cho bộ chấm mới; giảng viên sửa hoặc xoá dòng tuỳ ý. */
const DEFAULT_RUBRIC: EssayRubricRow[] = [
  { criterion: "Nội dung đúng trọng tâm", description: "Trả lời đúng yêu cầu của đề, kiến thức chính xác.", points: 4 },
  { criterion: "Lập luận và dẫn chứng", description: "Lập luận chặt chẽ, có ví dụ hoặc số liệu minh hoạ.", points: 3 },
  { criterion: "Bố cục và trình bày", description: "Có mở bài, thân bài, kết luận; diễn đạt rõ ràng.", points: 2 },
  { criterion: "Trích dẫn nguồn", description: "Ghi nguồn tài liệu tham khảo đúng cách.", points: 1 },
];

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const url = new URL(path, "http://local");
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function AssetProcessorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sid = first(sp.sid);
  const flowId = first(sp.flow);
  const processorId = first(sp.processor);
  const actionError = first(sp.reviewError);
  const actionSuccess = first(sp.reviewSuccess);

  let processor: EssayProcessor | null = null;
  let assignmentTitle: string | undefined;
  try {
    if (processorId) {
      const access = await assetProcessorEditAccess(processorId, sid);
      processor = await coreApi.getEssayProcessor<EssayProcessor>(processorId, access.claims);
    } else {
      const access = await assetProcessorFlowAccess(flowId, sid);
      assignmentTitle = access.flow.activityTitle;
    }
  } catch (error) {
    return (
      <main className="p-8 text-slate-700">
        <h1 className="mb-3 text-xl font-semibold">Chấm bài luận bằng AI</h1>
        <p>{error instanceof Error ? error.message : "Không mở được cấu hình bộ chấm."}</p>
      </main>
    );
  }

  const rubric = processor?.rubric ?? DEFAULT_RUBRIC;
  const rows = Array.from({ length: RUBRIC_ROWS }, (_, i) => rubric[i]);
  const action = withQuery("/api/lti/asset-processor", { flow: processor ? undefined : flowId, processor: processorId, sid });

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">DA Platform · Document Processor</p>
          <h1 className="text-xl font-semibold">
            {processor ? "Sửa bộ chấm bài luận" : "Gắn bộ chấm bài luận bằng AI"}
            {assignmentTitle ? ` · ${assignmentTitle}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sinh viên nộp file (PDF, DOCX, TXT) hoặc nhập chữ trong Canvas như bình thường. Mỗi lần nộp, AI đọc bài và
            chấm theo rubric dưới đây, rồi đưa điểm gợi ý kèm nhận xét vào SpeedGrader. Giảng viên quyết định điểm cuối.
          </p>
        </header>

        {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
        {actionSuccess && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>
        )}

        <form method="post" action={action} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tên bộ chấm (hiện trong Canvas)</span>
            <input
              name="title"
              required
              maxLength={255}
              defaultValue={processor?.title ?? "Chấm bài luận bằng AI (DA)"}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Đề bài và yêu cầu</span>
            <textarea
              name="instructions"
              rows={5}
              maxLength={10000}
              defaultValue={processor?.instructions ?? ""}
              placeholder="Dán đề bài, độ dài mong muốn, những ý bắt buộc phải có… AI dùng phần này để hiểu bài cần làm gì."
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <fieldset className="text-sm">
            <legend className="mb-2 font-medium">Rubric — điểm tối đa của bài là tổng điểm các tiêu chí</legend>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_5rem] gap-2 text-xs font-semibold uppercase text-slate-500">
              <span>Tiêu chí</span>
              <span>Mô tả cho AI</span>
              <span>Điểm</span>
            </div>
            <div className="mt-1 space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_5rem] gap-2">
                  <input
                    name={`criterion_${i}`}
                    maxLength={200}
                    defaultValue={row?.criterion ?? ""}
                    className="rounded border border-slate-300 px-2 py-1.5"
                  />
                  <input
                    name={`description_${i}`}
                    maxLength={1000}
                    defaultValue={row?.description ?? ""}
                    className="rounded border border-slate-300 px-2 py-1.5"
                  />
                  <input
                    name={`points_${i}`}
                    inputMode="decimal"
                    defaultValue={row ? String(row.points) : ""}
                    className="rounded border border-slate-300 px-2 py-1.5"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-slate-500">Để trống tên và điểm để bỏ một dòng. Tối đa {RUBRIC_ROWS} tiêu chí.</p>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="visibleToOwner" defaultChecked={processor?.visible_to_owner ?? false} className="mt-1" />
            <span>
              Cho sinh viên xem điểm gợi ý và nhận xét của AI.
              <span className="block text-slate-500">Để tắt nếu muốn đọc lại trước khi sinh viên thấy.</span>
            </span>
          </label>

          <button className="rounded border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {processor ? "Lưu thay đổi" : "Gắn vào bài tập"}
          </button>
        </form>
      </div>
    </main>
  );
}
