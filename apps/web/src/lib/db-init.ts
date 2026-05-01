import { createDatabase } from "@ctxnest/core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");

const DATA_DIR = process.env.CTXNEST_DATA_DIR || path.join(REPO_ROOT, "data");
const DB_PATH = process.env.CTXNEST_DB_PATH || path.join(DATA_DIR, "ctxnest.db");

export function ensureDbInitialized() {
  // Ensure DATA_DIR exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Ensure standard subdirectories exist
  const dirs = ["knowledge", "backups", "projects"];
  for (const d of dirs) {
    const fullPath = path.join(DATA_DIR, d);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Always check if DB exists on globalThis, don't rely on local flag
  if (!globalThis.__ctxnestDb) {
    const dbPath = process.env.CTXNEST_DB_PATH || DB_PATH;
    createDatabase(dbPath);
  }
}

export { DATA_DIR, DB_PATH };
