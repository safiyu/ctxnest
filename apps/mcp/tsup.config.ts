import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  shims: false,
  noExternal: ["@ctxnest/core"],
  // Native + runtime-resolved deps. tsup will leave these as plain imports
  // so npm install resolves prebuilt binaries / platform-specific modules.
  external: [
    "better-sqlite3",
    "chokidar",
    "fsevents",
    "@modelcontextprotocol/sdk",
    "zod",
    "simple-git",
  ],
  // Migration .sql files live under packages/core/src/db/migrations/ in
  // the source tree but `runMigrations()` in the bundled output reads
  // them from join(__dirname, "migrations"). After bundling, __dirname
  // is apps/mcp/dist/, so files must land at dist/migrations/.
  onSuccess: async () => {
    const srcDir = resolve(__dirname, "../../packages/core/src/db/migrations");
    const dstDir = resolve(__dirname, "dist/migrations");
    mkdirSync(dstDir, { recursive: true });
    for (const f of readdirSync(srcDir)) {
      if (f.endsWith(".sql")) {
        copyFileSync(join(srcDir, f), join(dstDir, f));
      }
    }
    console.log(`[tsup] copied migrations from ${srcDir} → ${dstDir}`);
  },
});
