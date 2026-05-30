import { NextRequest, NextResponse } from "next/server";
import { readLtiSession } from "./session";

export async function readSessionFromRequest(request: NextRequest) {
  return readLtiSession(request.nextUrl.searchParams.get("sid"));
}

export function redirectBack(request: NextRequest, fallback: string) {
  return NextResponse.redirect(request.headers.get("referer") || fallback, 303);
}
