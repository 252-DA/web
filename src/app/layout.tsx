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
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
