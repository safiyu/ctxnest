import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ctxnest-web-"));
  mkdirSync(join(dir, "knowledge"), { recursive: true });
  process.env.CTXNEST_DATA_DIR = dir;
  process.env.CTXNEST_DB_PATH = join(dir, "ctxnest.db");
});

afterEach(async () => {
  try {
    const { closeDatabase } = await import("@ctxnest/core");
    closeDatabase();
  } catch {}
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});
