import { NextRequest, NextResponse } from "next/server";
import { CoreApiError, coreApi, claimsFromSession } from "@/lib/core-api";
import { readSessionFromRequest } from "@/lib/route-session";

type UploadSession = {
  document_id: string;
  upload_url: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể upload tài liệu.";
}

function isNavigation(request: NextRequest) {
  return (
    request.headers.get("sec-fetch-mode") === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  );
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function publicOrigin(request: NextRequest) {
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host"));
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : request.nextUrl.protocol.replace(":", "");

  if (!host) {
    return request.nextUrl.origin;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return request.nextUrl.origin;
  }
}

function returnUrl(request: NextRequest) {
  const origin = publicOrigin(request);
  const fallback = new URL("/manage/documents", origin);
  const sid = request.nextUrl.searchParams.get("sid");
  if (sid) {
    fallback.searchParams.set("sid", sid);
  }
  const referer = request.headers.get("referer");
  if (!referer) {
    return fallback;
  }

  const candidate = new URL(referer, origin);
  return candidate.origin === origin ? candidate : fallback;
}

function uploadError(request: NextRequest, message: string, status: number) {
  if (isNavigation(request)) {
    const url = returnUrl(request);
    url.searchParams.set("uploadError", message);
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return uploadError(request, "Session expired", 401);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const courseId = String(form.get("courseId") || "");

    if (!(file instanceof File) || file.size === 0) {
      return uploadError(request, "Vui lòng chọn một tài liệu.", 400);
    }
    if (!courseId) {
      return uploadError(request, "Thiếu courseId.", 400);
    }

    const claims = claimsFromSession(activeSession.session);
    const uploadSession = await coreApi.createUploadSession<UploadSession>(
      {
        courseId,
        title: String(form.get("title") || file.name),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
      },
      claims,
    );

    const uploadResponse = await fetch(uploadSession.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Object storage trả về HTTP ${uploadResponse.status}.`);
    }

    const result = await coreApi.confirmUpload(uploadSession.document_id, claims);
    if (isNavigation(request)) {
      const url = returnUrl(request);
      url.searchParams.delete("uploadError");
      return NextResponse.redirect(url, 303);
    }
    return NextResponse.json(result, { status: 202 });
  } catch (error: unknown) {
    console.error("Document upload failed", error);
    const status = error instanceof CoreApiError ? 502 : 500;
    return uploadError(request, errorMessage(error), status);
  }
}
