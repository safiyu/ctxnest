import { createDatabase } from "@ctxnest/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");

const DATA_DIR = process.env.CTXNEST_DATA_DIR || path.join(REPO_ROOT, "data");
const DB_PATH = process.env.CTXNEST_DB_PATH || path.join(REPO_ROOT, "data/ctxnest.db");

let initialized = false;

export function ensureDbInitialized() {
  if (!initialized) {
    createDatabase(DB_PATH);
    initialized = true;
  }
}

export { DATA_DIR, DB_PATH };
