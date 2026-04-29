import chokidar, { type FSWatcher } from "chokidar";
import { getDatabase } from "../db/index.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface WatcherEvent {
  type: "change" | "add" | "unlink";
  path: string;
}

/** True when filePath is exactly under baseDir (not a sibling like /foo vs /foo2). */
function isUnder(filePath: string, baseDir: string): boolean {
  const rel = path.relative(baseDir, filePath);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function createFileWatcher(
  watchPaths: string[],
  onEvent: (event: WatcherEvent) => void
): FSWatcher {
  const watcher = chokidar.watch(watchPaths, {
    // Ignore dotfiles, node_modules, .git anywhere in the path, AND any file
    // that lives under a `backups/` directory (those are owned by syncBackup
    // and must not be re-ingested as standalone reference rows).
    ignored: (p: string) =>
      /(^|[\/\\])(\.|node_modules|\.git)/.test(p) ||
      /[\/\\]backups[\/\\]/.test(p),
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
    handleWatcherAdd(filePath);
    onEvent({ type: "add", path: filePath });
  });

  watcher.on("unlink", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    handleWatcherUnlink(filePath);
    onEvent({ type: "unlink", path: filePath });
  });

  return watcher;
}

function handleWatcherAdd(filePath: string): void {
  try {
    const db = getDatabase();
    // Check if already in DB
    const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath);
    if (existing) return;

    // Determine project_id with proper containment check (path.relative)
    // so /foo/bar doesn't match /foo/bar2 by string-prefix.
    let projectId: number | null = null;
    const projects = db.prepare("SELECT id, path FROM projects WHERE path IS NOT NULL").all() as { id: number, path: string }[];
    for (const p of projects) {
      if (isUnder(filePath, p.path)) {
        projectId = p.id;
        break;
      }
    }

    // Infer storage_type from where the file lives:
    // - inside a project root => "reference"
    // - elsewhere (e.g. data/knowledge) => "local"
    const storageType = projectId !== null ? "reference" : "local";

    const content = fs.readFileSync(filePath, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const title = filePath.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "Untitled";

    const result = db.prepare(
      "INSERT INTO files (path, title, project_id, storage_type, content_hash) VALUES (?, ?, ?, ?, ?)"
    ).run(filePath, title, projectId, storageType, hash);

    db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)").run(result.lastInsertRowid, title, content);
  } catch (e) {
    // DB not initialized or read failed
  }
}

function handleWatcherUnlink(filePath: string): void {
  try {
    const db = getDatabase();
    const file = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath) as { id: number } | undefined;
    if (file) {
      db.prepare("DELETE FROM fts_index WHERE rowid = ?").run(file.id);
      db.prepare("DELETE FROM files WHERE id = ?").run(file.id);
    }
  } catch (e) {
    // DB not initialized
  }
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
