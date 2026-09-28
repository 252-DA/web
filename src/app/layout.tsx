import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Micro-Learning",
  description: "LMS tích hợp AI tạo Micro-Content & Quiz",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Extension trình duyệt hay chèn thuộc tính vào <html>/<body> trước khi React
  // hydrate (vd class "mdl-js", "__processed_…"). Chỉ bỏ qua lệch thuộc tính
  // của đúng hai thẻ này; lệch bên trong cây vẫn báo lỗi như thường.
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
