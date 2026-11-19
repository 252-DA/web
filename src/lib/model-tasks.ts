/**
 * Tên hiển thị của các task chọn được model. Danh sách task thật đến từ
 * core-api (contracts/proto/llm_model_catalog.json); task lạ vẫn hiện bằng
 * khoá của nó.
 */
const TASK_LABELS: Record<string, { title: string; detail: string }> = {
  quiz_generation: {
    title: "Viết nội dung",
    detail: "Sinh câu hỏi và thẻ bài học, viết lại câu bị bước kiểm chứng loại.",
  },
  quiz_verification: {
    title: "Kiểm chứng & chấm tự luận",
    detail: "Đối chiếu câu hỏi/thẻ với tài liệu nguồn, chấm tự luận ngắn và bài luận nộp file. Nên khác model viết nội dung.",
  },
  enrichment: {
    title: "Làm giàu tài liệu",
    detail: "Trích khái niệm, sinh thẻ và câu hỏi tự động sau khi tài liệu được xử lý.",
  },
};

export function modelTaskLabel(task: string) {
  return TASK_LABELS[task] ?? { title: task, detail: "" };
}
