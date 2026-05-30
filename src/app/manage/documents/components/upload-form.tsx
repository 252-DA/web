"use client";

import { FormEvent, useState } from "react";

type Props = {
  courseId: string;
  sid?: string;
};

function withSid(path: string, sid?: string) {
  if (!sid) {
    return path;
  }
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function UploadForm({ courseId, sid }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("Chọn một file PDF hoặc tài liệu trước khi upload.");
      return;
    }

    setBusy(true);
    setMessage("Đang tạo upload session...");
    try {
      const sessionResponse = await fetch(withSid("/api/documents/upload-session", sid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          title: String(form.get("title") || file.name),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
      });
      if (!sessionResponse.ok) {
        throw new Error(await sessionResponse.text());
      }
      const uploadSession = (await sessionResponse.json()) as {
        document_id: string;
        upload_url: string;
      };

      setMessage("Đang đưa file lên object storage...");
      const uploadResponse = await fetch(uploadSession.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: HTTP ${uploadResponse.status}`);
      }

      setMessage("Đang xác nhận để chạy pipeline...");
      const confirmResponse = await fetch(
        withSid(`/api/documents/${uploadSession.document_id}/confirm-upload`, sid),
        { method: "POST" },
      );
      if (!confirmResponse.ok) {
        throw new Error(await confirmResponse.text());
      }

      setMessage("Đã enqueue xử lý tài liệu.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_1fr_auto]">
      <input
        name="title"
        placeholder="Tên tài liệu"
        className="h-10 rounded border border-slate-300 px-3 text-sm"
      />
      <input
        name="file"
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx,text/plain,application/pdf"
        className="h-10 rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="h-10 rounded bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        Upload
      </button>
      {message && <p className="md:col-span-3 text-sm text-slate-600">{message}</p>}
    </form>
  );
}
