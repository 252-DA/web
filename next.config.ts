import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["100.99.64.65", "canxphung.tail7a3c8b.ts.net"],
  // Allow server-side connections to Docker services
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader", "pg", "ioredis"],
};

export default nextConfig;
