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
  // Auto-ingest scope: files under <dataDir>/knowledge/ or a registered
  // project. Anything else is ignored (stray files would otherwise be
  // adopted as KB and could then be unlinked from disk on UI delete).
  const knowledgeDirs = watchPaths.map((wp) => path.join(wp, "knowledge"));

  const watcher = chokidar.watch(watchPaths, {
    // backups/ is owned by syncBackup; never re-ingest its files as standalone rows.
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
    handleWatcherAdd(filePath, knowledgeDirs);
    onEvent({ type: "add", path: filePath });
  });

  watcher.on("unlink", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    handleWatcherUnlink(filePath);
    onEvent({ type: "unlink", path: filePath });
  });

  return watcher;
}

function handleWatcherAdd(filePath: string, knowledgeDirs: string[]): void {
  try {
    const db = getDatabase();
    // Check if already in DB
    const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath);
    if (existing) return;

    let projectId: number | null = null;
    const projects = db.prepare("SELECT id, path FROM projects WHERE path IS NOT NULL").all() as { id: number, path: string }[];
    for (const p of projects) {
      if (isUnder(filePath, p.path)) {
        projectId = p.id;
        break;
      }
    }

    const isKnowledge = knowledgeDirs.some((kd) => isUnder(filePath, kd));
    if (projectId === null && !isKnowledge) return;

    const storageType = projectId !== null ? "reference" : "local";

    const content = fs.readFileSync(filePath, "utf-8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const title = filePath.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "Untitled";

    // OR IGNORE + skip-FTS-on-no-change covers the discoverFiles race.
    const insertStmt = db.prepare(
      "INSERT OR IGNORE INTO files (path, title, project_id, storage_type, content_hash) VALUES (?, ?, ?, ?, ?)"
    );
    const ftsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
    db.transaction(() => {
      const result = insertStmt.run(filePath, title, projectId, storageType, hash);
      if (result.changes > 0) {
        ftsStmt.run(result.lastInsertRowid, title, content);
      }
    })();
  } catch (e) {
    // DB not initialized or read failed
  }
}

function handleWatcherUnlink(filePath: string): void {
  try {
    const db = getDatabase();
    const file = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath) as { id: number } | undefined;
    if (file) {
      const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
      const deleteFileStmt = db.prepare("DELETE FROM files WHERE id = ?");
      db.transaction(() => {
        deleteFtsStmt.run(file.id);
        deleteFileStmt.run(file.id);
      })();
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
      const updateStmt = db.prepare("UPDATE files SET content_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
      const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
      const insertFtsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
      db.transaction(() => {
        updateStmt.run(hash, file.id);
        deleteFtsStmt.run(file.id);
        insertFtsStmt.run(file.id, file.title, content);
      })();
    }
  } catch {
    // DB not initialized or file not tracked
  }
}
