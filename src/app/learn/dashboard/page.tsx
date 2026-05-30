import { redirect } from "next/navigation";
import { readLtiSession } from "@/lib/session";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LearnDashboard({ searchParams }: Props) {
  const sp = await searchParams;
  const active = await readLtiSession(sp.sid);
  if (!active) {
    return <main className="p-8 text-slate-700">Phiên hết hạn. Vui lòng mở lại từ LMS.</main>;
  }
  const suffix = active.sid ? `?sid=${encodeURIComponent(active.sid)}` : "";
  redirect(`/learn/courses/${active.session.courseId}${suffix}`);
}
