import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@ctxnest/core"],
  serverExternalPackages: ["better-sqlite3"],
};
export default nextConfig;
