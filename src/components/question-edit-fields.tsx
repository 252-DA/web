import { answerKey, quizChoices } from "@/lib/quiz";
import {
  acceptedAnswers,
  correctKeys,
  essayKey,
  MAX_MULTI_OPTIONS,
  TRUE_FALSE_OPTIONS,
} from "@/lib/question-types";

const defaultInput =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

/**
 * Ô sửa đáp án theo kiểu câu, không kèm ô câu hỏi/giải thích. Tên trường khớp
 * `editFromForm` trong lib/question-types.ts; ô ẩn `type` để route form-post
 * biết đọc theo kiểu nào (core-api vẫn kiểm tra theo kiểu thật của câu).
 */
export function QuestionEditFields({
  quiz,
  inputClass = defaultInput,
}: {
  quiz: { type: string; options: unknown; correct_answer: unknown };
  inputClass?: string;
}) {
  const type = quiz.type;
  const hidden = <input type="hidden" name="type" value={type} />;

  if (type === "FILL_BLANK")
    return (
      <label className="grid gap-1 text-sm">
        {hidden}
        Đáp án chấp nhận, mỗi dòng một cách viết
        <textarea name="accepted" required rows={3} className={inputClass} defaultValue={acceptedAnswers(quiz.correct_answer).join("\n")} />
        <span className="text-xs text-slate-500">Câu hỏi phải giữ một chỗ trống viết là ____. Chấm không phân biệt hoa thường.</span>
      </label>
    );

  if (type === "SHORT_ANSWER") {
    const key = essayKey(quiz.correct_answer);
    return (
      <div className="grid gap-3">
        {hidden}
        <label className="grid gap-1 text-sm">
          Bài làm mẫu (đạt điểm tối đa)
          <textarea name="model_answer" required rows={3} className={inputClass} defaultValue={key.model_answer} />
        </label>
        <label className="grid gap-1 text-sm">
          Các ý chấm điểm, mỗi dòng một ý (1–6 ý, các ý ngang điểm nhau)
          <textarea name="rubric" required rows={4} className={inputClass} defaultValue={key.rubric.join("\n")} />
        </label>
      </div>
    );
  }

  if (type === "TRUE_FALSE")
    return (
      <fieldset className="grid gap-1 text-sm">
        {hidden}
        <legend className="mb-1">Mệnh đề trên là</legend>
        <div className="flex gap-4">
          {TRUE_FALSE_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input type="radio" name="correct_answer" value={option} required defaultChecked={quiz.correct_answer === option} />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );

  const choices = quizChoices(quiz.options);
  if (type === "MCQ_MULTI") {
    const correct = correctKeys(type, quiz.correct_answer);
    return (
      <fieldset className="grid gap-2 text-sm">
        {hidden}
        <legend className="mb-1">Phương án (4–6, để trống dòng thừa) · tick các đáp án đúng</legend>
        {Array.from({ length: MAX_MULTI_OPTIONS }, (_, i) => (
          <label key={i} className="grid grid-cols-[auto_auto_1fr] items-center gap-2">
            <input
              type="checkbox"
              name={`correct_${i}`}
              defaultChecked={choices[i] ? correct.has(answerKey(choices[i].value)) : false}
              aria-label={`Phương án ${String.fromCharCode(65 + i)} đúng`}
            />
            <span className="font-semibold text-slate-400">{String.fromCharCode(65 + i)}</span>
            <input name={`option_${i}`} required={i < 4} className={inputClass} defaultValue={choices[i]?.label || ""} />
          </label>
        ))}
      </fieldset>
    );
  }

  const correctIndex = Math.max(
    0,
    choices.findIndex((c) => answerKey(c.value) === answerKey(quiz.correct_answer)),
  );
  return (
    <div className="grid gap-3">
      {hidden}
      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="grid gap-1 text-sm">
            Phương án {String.fromCharCode(65 + i)}
            <input name={`option_${i}`} required className={inputClass} defaultValue={choices[i]?.label || ""} />
          </label>
        ))}
      </div>
      <label className="grid gap-1 text-sm">
        Đáp án đúng
        <select name="correctIndex" className={`${inputClass} w-32`} defaultValue={correctIndex}>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              {String.fromCharCode(65 + i)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
