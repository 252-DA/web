import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { renewalTtl } from "@/lib/session-ttl";

export { SESSION_MAX_AGE, SESSION_TTL, sessionTtlFor } from "@/lib/session-ttl";

export interface LtiSession {
  internalUserId: string;
  lmsType: "openedx" | "moodle" | "canvas";
  lmsSub: string;
  email: string | null;
  displayName: string | null;
  courseId: string;
  lmsContextId: string;
  role: "instructor" | "learner" | "administrator";
  courseRole: "instructor" | "learner" | "ta" | "observer";
  roles: string[];
  lmsCourseRefId?: string;
  resourceLinkId?: string;
  targetKind?: "lesson" | "card" | "quiz_set" | "chat" | "video" | "micro_content";
  targetId?: string | null;
  /** Bài làm đang xem khi SpeedGrader launch DA (chỉ giảng viên/trợ giảng). */
  submissionId?: string;
  loIds: string[];
  chatbotEnabled: boolean;
  /** TTL trượt của phiên này (giây); thiếu thì dùng SESSION_TTL. */
  ttlSeconds?: number;
  /** Lúc tạo phiên (epoch giây), làm gốc cho trần tuyệt đối SESSION_MAX_AGE. */
  issuedAt?: number;
}

export interface ActiveLtiSession {
  session: LtiSession;
  /**
   * Only present when the session was recovered from the explicit `sid` query
   * fallback. Cookie-backed session IDs must stay server-only.
   */
  sid?: string;
}

export type ManageSessionResult =
  | { status: "active"; active: ActiveLtiSession }
  | { status: "expired" }
  | { status: "forbidden" };

export function sessionKey(internalUserId: string): string {
  return `session:lms:${internalUserId}`;
}

function firstParam(value?: string | string[] | null): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value || undefined;
}

/**
 * Gia hạn trượt: mỗi request của người dùng đang dùng phiên đẩy hạn Redis ra
 * thêm đúng TTL của phiên, tới trần SESSION_MAX_AGE. Cookie không gia hạn được
 * lúc render (Next.js chỉ cho đặt cookie ở route handler), nên cookie sống tới
 * trần và Redis mới là nơi quyết định phiên còn hiệu lực hay không.
 * Lỗi gia hạn không được làm hỏng request: phiên chỉ hết hạn theo hạn cũ.
 */
async function renewSession(sid: string, session: LtiSession) {
  const ttl = renewalTtl(
    session.ttlSeconds,
    session.issuedAt,
    Math.floor(Date.now() / 1000),
  );
  if (ttl <= 0) return;
  try {
    await redis.expire(sessionKey(sid), ttl);
  } catch (error) {
    console.warn("[session] không gia hạn được phiên:", error);
  }
}

export async function readLtiSession(
  sidParam?: string | string[] | null
): Promise<ActiveLtiSession | null> {
  const cookieStore = await cookies();
  const cookieSid = cookieStore.get("sid")?.value;
  const querySid = firstParam(sidParam);
  const candidates: Array<{ sid: string; exposeSid: boolean }> = [];

  if (cookieSid) {
    candidates.push({ sid: cookieSid, exposeSid: false });
  }
  if (querySid && querySid !== cookieSid) {
    candidates.push({ sid: querySid, exposeSid: true });
  }

  for (const candidate of candidates) {
    const sessionData = await redis.get(sessionKey(candidate.sid));
    if (!sessionData) {
      continue;
    }

    try {
      const session = JSON.parse(sessionData) as LtiSession;
      await renewSession(candidate.sid, session);
      return candidate.exposeSid
        ? { sid: candidate.sid, session }
        : { session };
    } catch {
      // A stale/corrupt cookie should not prevent the explicit query fallback.
    }
  }

  return null;
}

function canManageCourse(session: LtiSession): boolean {
  return (
    session.role === "administrator" ||
    session.role === "instructor" ||
    session.courseRole === "instructor" ||
    session.courseRole === "ta"
  );
}

export async function readManageSession(
  sidParam?: string | string[] | null
): Promise<ManageSessionResult> {
  const active = await readLtiSession(sidParam);
  if (!active) {
    return { status: "expired" };
  }
  if (!canManageCourse(active.session)) {
    return { status: "forbidden" };
  }
  return { status: "active", active };
}
