import Link from "next/link";
import { redis } from "@/lib/redis";

const DEV_SESSION = {
  internalUserId: "62229588-81a1-4200-af80-e8a042636eaa",
  lmsType: "canvas",
  lmsSub: "4d5925c8-d28b-4e23-96bf-27fb8024c388",
  email: "admin@canvas.local",
  displayName: "Giảng viên (Demo)",
  courseId: "1fbf0736-0e3f-4bc3-afcd-40ca316daa60",
  lmsContextId: "canvas:4dde05e8ca1973bcca9bffc13e1548820eee93a3",
  role: "instructor",
  courseRole: "instructor",
  roles: ["instructor"],
  loIds: [],
  chatbotEnabled: true,
};

// Ai mở được trang này cũng dùng được phiên giảng viên dựng sẵn qua
// ?sid=dev-session, nên chỉ bật khi đặt rõ DEMO_PORTAL_SESSION=true trên máy
// không mở ra ngoài. NODE_ENV không đủ: web dev cũng chạy qua tunnel công khai.
const DEMO_SESSION_ENABLED = process.env.DEMO_PORTAL_SESSION === "true";
const DEMO_SID = "dev-session";

async function ensureDevSession(): Promise<string | null> {
  try {
    const key = `session:lms:${DEMO_SID}`;
    const existing = await redis.get(key);
    if (!existing) {
      await redis.set(key, JSON.stringify(DEV_SESSION), "EX", 7 * 24 * 3600);
    }
    return DEMO_SID;
  } catch (err) {
    console.error("[dev-session] Failed to ensure dev session:", err);
    return null;
  }
}

export default async function HomePage() {
  const sid = DEMO_SESSION_ENABLED ? await ensureDevSession() : null;
  const withSid = (href: string) =>
    sid ? `${href}${href.includes("?") ? "&" : "?"}sid=${sid}` : href;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* Glow highlight */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-96 bg-gradient-to-r from-sky-500/10 via-indigo-500/15 to-purple-500/10 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-medium text-sky-300 backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
            Đồ Án Tốt Nghiệp · Nền Tảng Micro-Learning Tích Hợp AI
          </div>

          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl text-white">
            Hệ Thống Học Liệu{" "}
            <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Micro-Content & Video AI
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg text-slate-400">
            Nền tảng học tập thông minh chuẩn LTI 1.3: Tự động trích xuất kịch bản từ slide PDF bài giảng, 
            tổng hợp video AI đa giọng đọc và quản lý kho học liệu số tập trung (Video DAM).
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={withSid("/manage/micro-content")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 transition-all hover:scale-[1.02]"
            >
              🚀 Mở Không Gian Quản Lý (Giảng Viên)
            </Link>
            <Link
              href={withSid("/manage/media")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3.5 text-sm font-semibold text-slate-200 hover:bg-slate-700/80 hover:text-white transition-all backdrop-blur"
            >
              📚 Xem Kho Học Liệu Video (DAM)
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Micro-Content Studio */}
          <Link
            href={withSid("/manage/micro-content")}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur transition-all hover:border-sky-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-sky-500/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 group-hover:scale-110 transition-transform text-2xl">
              🎓
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-sky-300 transition-colors">
              Quản Lý Micro-Content
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Soạn thảo các bài học ngắn cô đọng, cấu hình điểm đạt, tỷ lệ xem video bắt buộc và câu hỏi củng cố kiến thức tương tác.
            </p>
            <span className="mt-4 inline-flex items-center text-xs font-semibold text-sky-400 group-hover:translate-x-1 transition-transform">
              Truy cập ngay →
            </span>
          </Link>

          {/* Card 2: Video Asset DAM */}
          <Link
            href={withSid("/manage/media")}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur transition-all hover:border-indigo-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-indigo-500/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform text-2xl">
              📚
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">
              Kho Video Dùng Chung (DAM)
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Quản lý tài nguyên media tập trung, chống upload trùng lặp bằng mã băm SHA-256, liên kết tái sử dụng 1 video cho nhiều bài học.
            </p>
            <span className="mt-4 inline-flex items-center text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
              Xem kho video →
            </span>
          </Link>

          {/* Card 3: AI Video Studio */}
          <Link
            href={withSid("/manage/micro-content/19d07719-aead-457a-8893-885130fe99d3/edit?tab=video")}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur transition-all hover:border-purple-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-purple-500/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform text-2xl">
              🤖
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-purple-300 transition-colors">
              AI Video & Bóc Tách PDF
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Tải file slide PDF lên để AI tự động chuyển thành kịch bản, tùy chọn đa giọng đọc tiếng Việt/Anh và nghe thử trực tiếp trên trình duyệt.
            </p>
            <span className="mt-4 inline-flex items-center text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition-transform">
              Trải nghiệm studio →
            </span>
          </Link>

          {/* Card 4: Learner Experience */}
          <Link
            href={withSid("/learn/micro-content/19d07719-aead-457a-8893-885130fe99d3")}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur transition-all hover:border-emerald-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-emerald-500/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform text-2xl">
              👨‍🎓
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors">
              Giao Diện Phía Sinh Viên
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Xem trực tiếp trải nghiệm của người học: xem video học tập với trình phát tối ưu, trả lời câu hỏi và chấm điểm tức thì.
            </p>
            <span className="mt-4 inline-flex items-center text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
              Xem giao diện học →
            </span>
          </Link>

          {/* Card 5: Instructor Dashboard */}
          <Link
            href={withSid("/manage/dashboard")}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur transition-all hover:border-amber-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-amber-500/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform text-2xl">
              📊
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-amber-300 transition-colors">
              Bảng Điều Khiển Khóa Học
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Quản trị toàn diện: Theo dõi tiến độ học tập của sinh viên, xem thống kê tương tác và quản lý đề cương tài liệu.
            </p>
            <span className="mt-4 inline-flex items-center text-xs font-semibold text-amber-400 group-hover:translate-x-1 transition-transform">
              Mở dashboard →
            </span>
          </Link>

          {/* Card 6: Architecture Overview */}
          <div className="relative rounded-2xl border border-slate-800 bg-slate-900/30 p-6 backdrop-blur">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 text-2xl">
              ⚡
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">
              Kiến Trúc Cloud-Native
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              15 Microservices điều phối qua Transactional Outbox, MinIO S3 Object Storage, Qdrant Vector DB, Neo4j Graph và Edge-TTS.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-mono text-slate-400">
              <span className="rounded bg-slate-800 px-2 py-0.5">NestJS</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">Next.js 15</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">Python Worker</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">MinIO</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-16 border-t border-slate-800/80 pt-8 text-center text-xs text-slate-500">
          Khóa học demo: <span className="text-slate-400 font-medium">CO3137 - Dữ liệu lớn (Big Data)</span> · Phiên: <span className="font-mono text-sky-400">dev-session (Administrator)</span>
        </div>
      </div>
    </main>
  );
}
