import { NextRequest, NextResponse } from "next/server";
import { coreApi, claimsFromSession, coreApiErrorStatus } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const claims = claimsFromSession(activeSession.session);
    const asset = await coreApi.getVideoAsset(id, claims);
    return NextResponse.json(asset);
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tìm thấy video." },
      { status },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const claims = claimsFromSession(activeSession.session);

    const updated = await coreApi.updateVideoAsset(
      {
        assetId: id,
        title: body.title,
        description: body.description,
        tags: body.tags,
        visibility: body.visibility,
        allowFork: body.allowFork,
      },
      claims,
    );

    return NextResponse.json(updated);
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật video." },
      { status },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const claims = claimsFromSession(activeSession.session);
    const result = await coreApi.deleteVideoAsset(id, claims);
    return NextResponse.json(result);
  } catch (error) {
    const status = coreApiErrorStatus(error, 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xoá video." },
      { status },
    );
  }
}

