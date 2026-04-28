import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ctxnest/core"],
  serverExternalPackages: ["better-sqlite3"],
};
export default nextConfig;
