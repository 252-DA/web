import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    }

    const { id } = await context.params;
    const session = activeSession.session;
    const claims = claimsFromSession(session);
    const body = await request.json();

    const action = body.action;

    if (action === "request_script") {
      const result = await coreApi.requestMicroContentScript(
        {
          microContentId: id,
          prompt: body.prompt,
          options: body.options,
        },
        claims,
      );
      return NextResponse.json(result);
    }

    if (action === "save_script") {
      const result = await coreApi.saveMicroContentScript(
        {
          microContentId: id,
          script: body.script,
        },
        claims,
      );
      return NextResponse.json(result);
    }

    if (action === "request_render") {
      const result = await coreApi.requestMicroContentRender(id, claims);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Thao tác AI thất bại." },
      { status },
    );
  }
}
