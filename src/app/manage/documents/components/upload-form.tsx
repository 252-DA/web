"use client";

import { FormEvent, useState } from "react";

type Props = {
  courseId: string;
  sid?: string;
  initialMessage?: string;
};

function withSid(path: string, sid?: string) {
  if (!sid) {
    return path;
  }
  const url = new URL(path, "http://local");
  url.searchParams.set("sid", sid);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || `Upload failed: HTTP ${response.status}`;
}

export function UploadForm({ courseId, sid, initialMessage }: Props) {
  const [message, setMessage] = useState(initialMessage || "");
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
    setMessage("Đang upload và đưa tài liệu vào hàng đợi...");
    try {
      const payload = new FormData();
      payload.set("courseId", courseId);
      payload.set("title", String(form.get("title") || file.name));
      payload.set("file", file);

      const uploadResponse = await fetch(withSid("/api/documents/upload", sid), {
        method: "POST",
        body: payload,
      });
      if (!uploadResponse.ok) {
        throw new Error(await responseError(uploadResponse));
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
    <form
      action={withSid("/api/documents/upload", sid)}
      method="post"
      encType="multipart/form-data"
      onSubmit={submit}
      className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_1fr_auto]"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input
        name="title"
        placeholder="Tên tài liệu"
        className="h-10 rounded border border-slate-300 px-3 text-sm"
      />
      <input
        name="file"
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.md,.markdown,application/pdf,text/markdown"
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
