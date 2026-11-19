/** Phiên mặc định, gia hạn trượt mỗi request (xem readLtiSession). */
export const SESSION_TTL = 30 * 60; // 30 phút
/** Phiên thi sống thêm chừng này sau thời gian làm bài, để nộp bài kịp. */
export const EXAM_SESSION_MARGIN = 10 * 60; // 10 phút
/** Trần tuyệt đối: dù hoạt động liên tục, phiên không được gia hạn quá mốc này. */
export const SESSION_MAX_AGE = 12 * 60 * 60; // 12 giờ

/**
 * TTL của phiên. Bài kiểm tra có thời gian làm dài hơn mặc định thì phiên phải
 * sống ít nhất bằng thời gian làm + 10 phút, nếu không sinh viên đang làm bài
 * dở (không gửi request nào) sẽ mất phiên trước khi nộp.
 */
export function sessionTtlFor(timeLimitMinutes?: number | null): number {
  if (
    typeof timeLimitMinutes !== "number" ||
    !Number.isFinite(timeLimitMinutes) ||
    timeLimitMinutes <= 0
  )
    return SESSION_TTL;
  const ttl = Math.ceil(timeLimitMinutes) * 60 + EXAM_SESSION_MARGIN;
  return Math.min(Math.max(SESSION_TTL, ttl), SESSION_MAX_AGE);
}

/**
 * Số giây Redis cần giữ phiên sau lần gia hạn này; 0 nghĩa là đã chạm trần tuyệt
 * đối và phiên không được gia hạn nữa. Phiên cũ (chưa có issuedAt) gia hạn như
 * trước, không có trần.
 */
export function renewalTtl(
  ttlSeconds: number | undefined,
  issuedAt: number | undefined,
  nowSeconds: number,
): number {
  const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : SESSION_TTL;
  if (!issuedAt) return ttl;
  const remaining = issuedAt + SESSION_MAX_AGE - nowSeconds;
  return Math.max(0, Math.min(ttl, remaining));
}
