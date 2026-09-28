import { cookies } from "next/headers";
import { redis } from "@/lib/redis";

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
  targetKind?: "lesson" | "card" | "quiz_set" | "chat" | "video";
  targetId?: string | null;
  loIds: string[];
  chatbotEnabled: boolean;
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

export const SESSION_TTL = 30 * 60; // 30 phút

export function sessionKey(internalUserId: string): string {
  return `session:lms:${internalUserId}`;
}

function firstParam(value?: string | string[] | null): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value || undefined;
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
