import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

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

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Vui lòng chọn một file video hợp lệ." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "Dung lượng video vượt quá giới hạn 500 MB." },
        { status: 400 },
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["mp4", "webm"].includes(ext || "")) {
      return NextResponse.json(
        { error: "Định dạng không được hỗ trợ. Vui lòng tải file .mp4 hoặc .webm." },
        { status: 400 },
      );
    }

    // 1. Tạo upload session và presigned PUT URL
    const uploadSession = await coreApi.createMicroContentUpload<{
      uploadUrl: string;
      objectKey: string;
    }>(id, file.name, claims);

    // 2. Chuyển tiếp stream video lên MinIO
    const uploadRes = await fetch(uploadSession.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error(`MinIO storage trả về HTTP ${uploadRes.status}`);
    }

    // 3. Xác nhận upload với server
    const durationMs = Number(form.get("durationMs")) || 0;
    const confirmed = await coreApi.confirmMicroContentUpload(
      id,
      claims,
    );

    return NextResponse.json(confirmed);
  } catch (error) {
    const status =
      error instanceof CoreApiError
        ? { 3: 400, 5: 404, 7: 403, 16: 401 }[error.status] ?? 502
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tải video lên thất bại." },
      { status },
    );
  }
}
