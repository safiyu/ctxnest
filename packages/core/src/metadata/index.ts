/**
 * Metadata operations module for CtxNest
 * Handles tags, favorites, search, project registration, and file discovery
 */

import { readdirSync, lstatSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { getDatabase } from "../db/index.js";
import type { TagRecord, ProjectRecord, FileRecord, SearchFilters } from "../types.js";
import { computeHash } from "../files/index.js";

export interface FileRecordWithRank extends FileRecord {
  rank: number;
}

/**
 * Convert name to slug (lowercase, alphanumeric with dashes)
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Add tags to a file
 */
export function addTags(fileId: number, tagNames: string[]): void {
  const db = getDatabase();

  const insertTagStmt = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const getTagStmt = db.prepare("SELECT id FROM tags WHERE name = ?");
  const linkTagStmt = db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)");

  for (const tagName of tagNames) {
    insertTagStmt.run(tagName);
    const tag = getTagStmt.get(tagName) as { id: number };
    linkTagStmt.run(fileId, tag.id);
  }
}

/**
 * Remove tags from a file
 */
export function removeTags(fileId: number, tagIds: number[]): void {
  const db = getDatabase();

  const deleteStmt = db.prepare("DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?");

  for (const tagId of tagIds) {
    deleteStmt.run(fileId, tagId);
  }
}

/**
 * Set or unset a file as favorite
 */
export function setFavorite(fileId: number, favorite: boolean): void {
  const db = getDatabase();

  if (favorite) {
    const insertStmt = db.prepare("INSERT OR IGNORE INTO favorites (file_id) VALUES (?)");
    insertStmt.run(fileId);
  } else {
    const deleteStmt = db.prepare("DELETE FROM favorites WHERE file_id = ?");
    deleteStmt.run(fileId);
  }
}

/**
 * Search files using FTS5 with optional filters
 */
export function search(filters: SearchFilters): FileRecordWithRank[] {
  const db = getDatabase();

  let sql = `
    SELECT files.*, fts_index.rank
    FROM fts_index
    JOIN files ON files.id = fts_index.rowid
    WHERE fts_index MATCH ?
  `;
  const params: any[] = [filters.query];

  if (filters.project_id !== undefined) {
    sql += " AND files.project_id = ?";
    params.push(filters.project_id);
  }

  if (filters.favorite !== undefined && filters.favorite) {
    sql += " AND EXISTS (SELECT 1 FROM favorites WHERE favorites.file_id = files.id)";
  }

  if (filters.tags !== undefined && filters.tags.length > 0) {
    // All tags must be present (AND condition)
    for (const tag of filters.tags) {
      sql += ` AND EXISTS (
        SELECT 1 FROM file_tags
        JOIN tags ON tags.id = file_tags.tag_id
        WHERE file_tags.file_id = files.id AND tags.name = ?
      )`;
      params.push(tag);
    }
  }

  sql += " ORDER BY rank LIMIT 50";

  const stmt = db.prepare(sql);
  return stmt.all(...params) as FileRecordWithRank[];
}

/**
 * Register a new project
 */
export function registerProject(
  name: string,
  path: string,
  description?: string,
  remoteUrl?: string
): ProjectRecord {
  const db = getDatabase();

  const slug = slugify(name);
  const insertStmt = db.prepare(`
    INSERT INTO projects (name, slug, path, description, remote_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(name, slug, path, description || null, remoteUrl || null);
  const projectId = Number(result.lastInsertRowid);

  const projectRecord = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRecord;
  return projectRecord;
}

/**
 * Unregister a project and remove all its file metadata
 */
export function unregisterProject(projectId: number, dataDir?: string): void {
  const db = getDatabase();

  // Capture project slug before we drop the row so we can clean up its
  // backup subtree (otherwise re-registering the project later would
  // re-ingest stale orphan files from data/backups/<slug>/).
  const project = db.prepare("SELECT slug FROM projects WHERE id = ?").get(projectId) as
    | { slug: string }
    | undefined;

  db.transaction(() => {
    // 1. Get all file IDs associated with the project
    const files = db.prepare("SELECT id FROM files WHERE project_id = ?").all(projectId) as { id: number }[];
    const fileIds = files.map(f => f.id);

    if (fileIds.length > 0) {
      // 2. Delete from FTS index
      const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
      for (const id of fileIds) {
        deleteFtsStmt.run(id);
      }

      // 3. Delete from files (file_tags and favorites will cascade delete)
      db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
    }

    // 4. Delete the project
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  })();

  // 5. Outside the txn: remove the project's backup subtree on disk so the
  // next syncBackup doesn't resurrect ghost files. Best-effort; log on fail.
  if (dataDir && project?.slug) {
    const backupSubtree = join(dataDir, "backups", project.slug);
    try {
      if (existsSync(backupSubtree)) {
        rmSync(backupSubtree, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn("unregisterProject: failed to remove backup subtree:", e);
    }
  }
}

/**
 * Discover markdown files in a project's external path
 */
export function discoverFiles(projectId: number, dataDir: string): FileRecord[] {
  const db = getDatabase();

  // Get project path
  const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string | null } | undefined;
  if (!project || !project.path) {
    throw new Error(`Project path not found for project: ${projectId}`);
  }

  const projectPath = project.path;
  const discoveredFiles: FileRecord[] = [];
  // Cap size to keep huge files from blowing up memory and the FTS index.
  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB

  function scanDirectory(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (e) {
      // EACCES, ENOENT, etc. - skip the whole subtree but keep going.
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let lst;
      try {
        lst = lstatSync(fullPath);
      } catch (e) {
        continue;
      }
      // Skip symlinks entirely - prevents loops and prevents reading files
      // outside the project tree via a symlink.
      if (lst.isSymbolicLink()) continue;

      if (lst.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        scanDirectory(fullPath);
      } else if (lst.isFile() && extname(entry) === ".md") {
        if (lst.size > MAX_FILE_BYTES) {
          console.warn(`discoverFiles: skipping ${fullPath} (size ${lst.size} > ${MAX_FILE_BYTES})`);
          continue;
        }
        try {
          // Check if file already exists in DB
          const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(fullPath) as { id: number } | undefined;
          if (existing) continue;

          const content = readFileSync(fullPath, "utf8");
          const contentHash = computeHash(content);
          const title = basename(entry, ".md");

          const insertStmt = db.prepare(`
            INSERT INTO files (path, title, project_id, storage_type, content_hash)
            VALUES (?, ?, ?, 'reference', ?)
          `);
          const result = insertStmt.run(fullPath, title, projectId, contentHash);
          const fileId = Number(result.lastInsertRowid);

          const ftsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
          ftsStmt.run(fileId, title, content);

          const fileRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRecord;
          discoveredFiles.push(fileRecord);
        } catch (e) {
          console.warn(`discoverFiles: failed for ${fullPath}:`, e);
        }
      }
    }
  }

  scanDirectory(projectPath);
  return discoveredFiles;
}

/**
 * List all tags
 */
export function listTags(): TagRecord[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM tags ORDER BY name");
  return stmt.all() as TagRecord[];
}

/**
 * List all projects
 */
export function listProjects(): ProjectRecord[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM projects ORDER BY name");
  return stmt.all() as ProjectRecord[];
}
