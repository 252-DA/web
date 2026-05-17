import { cookies } from "next/headers";
import { redis } from "@/lib/redis";

export interface LtiSession {
  internalUserId: string;
  lmsType: "openedx" | "moodle" | "canvas";
  lmsUserId: string;
  email: string | null;
  displayName: string | null;
  courseId: string;
  roles: string[];
  documentId: string | null;
  loIds: string[];
  chatbotEnabled: boolean;
}

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
): Promise<{ sid: string; session: LtiSession } | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get("sid")?.value || firstParam(sidParam);
  if (!sid) {
    return null;
  }

  const sessionData = await redis.get(sessionKey(sid));
  if (!sessionData) {
    return null;
  }

  try {
    return { sid, session: JSON.parse(sessionData) as LtiSession };
  } catch {
    return null;
  }
}
