import { NextRequest, NextResponse } from "next/server";
import { readSessionFromRequest, isValidOrigin } from "@/lib/route-session";

export async function POST(request: NextRequest) {
  const activeSession = await readSessionFromRequest(request);
  if (!activeSession) {
    return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const startPageStr = (formData.get("startPage") as string) || "1";
    const endPageStr = (formData.get("endPage") as string) || "20";
    const targetScenesStr = (formData.get("targetScenes") as string) || "5";
    const topic = (formData.get("topic") as string) || "";

    const startPage = parseInt(startPageStr, 10) || 1;
    const endPage = parseInt(endPageStr, 10) || 20;
    const targetScenes = parseInt(targetScenesStr, 10) || 5;

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn file PDF bài giảng." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Định dạng file không hợp lệ. Vui lòng chọn file .pdf." }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File PDF quá lớn. Dung lượng tối đa là 50 MB." }, { status: 400 });
    }

    // Đọc trực tiếp trong RAM, mã hóa Base64 gửi sang worker (không tốn I/O MinIO)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = buffer.toString("base64");

    const defaultWorkerUrl = process.env.MICRO_CONTENT_WORKER_URL || "http://micro-content-video-worker:8086";

    const payload = JSON.stringify({
      pdf_base64: pdfBase64,
      start_page: startPage,
      end_page: endPage,
      target_scenes: targetScenes,
      topic: topic || file.name.replace(/\.pdf$/i, ""),
    });

    let res: Response;
    try {
      res = await fetch(`${defaultWorkerUrl}/script-from-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
    } catch {
      // Fallback localhost:8086 nếu dev chạy máy chủ Next.js bên ngoài Docker
      res = await fetch("http://localhost:8086/script-from-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
    }

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Không thể trích xuất kịch bản từ file PDF." },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Đã có lỗi khi xử lý file PDF." },
      { status: 500 },
    );
  }
}

