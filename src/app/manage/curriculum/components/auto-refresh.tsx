"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Tải lại dữ liệu trang định kỳ trong lúc worker còn đang xử lý đề cương. */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
