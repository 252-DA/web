import type { NextConfig } from "next";

// Next 16 dev chặn HMR websocket từ origin lạ, và khi thiếu HMR thì trang dev
// không hydrate — nút bấm trong iframe Canvas sẽ chết. Domain công khai của
// tool (qua tunnel) lấy từ LTI_REDIRECT_URI.
function toolHost() {
  try {
    return new URL(process.env.LTI_REDIRECT_URI ?? "").hostname;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];

    // Dev chunk URLs can keep the same name across edits. Prevent the public
    // tunnel and browser from reusing old JavaScript with freshly rendered HTML.
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  allowedDevOrigins: [
    "100.99.64.65",
    "canxphung.tail7a3c8b.ts.net",
    ...[toolHost()].filter((host): host is string => Boolean(host) && host !== "localhost"),
  ],
  // Allow server-side connections to Docker services
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader", "pg", "ioredis"],
};

export default nextConfig;
