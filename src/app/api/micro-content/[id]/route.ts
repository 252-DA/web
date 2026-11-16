import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: Context) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const session = activeSession.session;
    const claims = claimsFromSession(session);
    const data = await coreApi.getMicroContent(id, claims);
    return NextResponse.json(data);
  } catch (error) {
    const status = coreApiErrorStatus(error, 400);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi khi lấy thông tin." },
      { status },
    );
  }
}

export async function PUT(request: NextRequest, context: Context) {
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

    const updated = await coreApi.updateMicroContent(
      {
        microContentId: id,
        title: body.title,
        description: body.description,
        passingScore: body.passingScore !== undefined ? Number(body.passingScore) : undefined,
        requiredWatchPercent:
          body.requiredWatchPercent !== undefined ? Number(body.requiredWatchPercent) : undefined,
        aiPrompt: body.aiPrompt,
        aiOptions: body.aiOptions,
        ...(body.sourceDocumentId !== undefined
          ? { sourceDocumentId: body.sourceDocumentId }
          : {}),
        ...(body.sourcePageFrom !== undefined
          ? {
              sourcePageFrom:
                body.sourcePageFrom === null ? null : Number(body.sourcePageFrom),
            }
          : {}),
        ...(body.sourcePageTo !== undefined
          ? {
              sourcePageTo:
                body.sourcePageTo === null ? null : Number(body.sourcePageTo),
            }
          : {}),
        ...(body.loId !== undefined ? { loId: body.loId } : {}),
        ...(body.position !== undefined
          ? { position: body.position === null ? null : Number(body.position) }
          : {}),
      },
      claims,
    );

    return NextResponse.json(updated);
  } catch (error) {
    const status = coreApiErrorStatus(error, 400);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật." },
      { status },
    );
  }
}

export async function DELETE(request: NextRequest, context: Context) {
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

    const result = await coreApi.deleteMicroContent(id, claims);
    return NextResponse.json(result);
  } catch (error) {
    const status = coreApiErrorStatus(error, 400);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xoá." },
      { status },
    );
  }
}

