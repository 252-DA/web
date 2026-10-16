import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";
import { LTI_CONFIG } from "@/lib/lti";

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
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502
        : 400;
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
    if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
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
      },
      claims,
    );

    return NextResponse.json(updated);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502
        : 400;
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
    if (request.headers.get("origin") !== new URL(LTI_CONFIG.redirectUri).origin) {
      return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
    }

    const { id } = await context.params;
    const session = activeSession.session;
    const claims = claimsFromSession(session);

    const result = await coreApi.deleteMicroContent(id, claims);
    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502
        : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xoá." },
      { status },
    );
  }
}

