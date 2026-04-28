import chokidar, { type FSWatcher } from "chokidar";
import { getDatabase } from "../db/index.js";
import crypto from "node:crypto";
import fs from "node:fs";

export interface WatcherEvent {
  type: "change" | "add" | "unlink";
  path: string;
}

export function createFileWatcher(
  watchPaths: string[],
  onEvent: (event: WatcherEvent) => void
): FSWatcher {
  const watcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])(\.|node_modules|\.git)/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on("change", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    updateFileHash(filePath);
    onEvent({ type: "change", path: filePath });
  });

  watcher.on("add", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    onEvent({ type: "add", path: filePath });
  });

  watcher.on("unlink", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    onEvent({ type: "unlink", path: filePath });
  });

  return watcher;
}

function updateFileHash(filePath: string): void {
  try {
    const db = getDatabase();
    const content = fs.readFileSync(filePath, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const file = db.prepare("SELECT id, title FROM files WHERE path = ?").get(filePath) as
      | { id: number; title: string }
      | undefined;
    if (file) {
      db.prepare("UPDATE files SET content_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, file.id);
      db.prepare("DELETE FROM fts_index WHERE rowid = ?").run(file.id);
      db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)").run(file.id, file.title, content);
    }
  } catch {
    // DB not initialized or file not tracked
  }
}
