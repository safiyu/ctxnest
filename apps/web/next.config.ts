import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ctxnest/core"],
  serverExternalPackages: ["better-sqlite3", "archiver", "jsdom"],
};
export default nextConfig;
