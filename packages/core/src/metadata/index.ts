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

export interface RelatedFileRecord extends FileRecord {
  shared_tag_count: number;
  shared_tags: string[];
}

export function findRelated(fileId: number, limit: number = 10): RelatedFileRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
      SELECT
        f.*,
        COUNT(ft2.tag_id) AS shared_tag_count,
        GROUP_CONCAT(t.name) AS shared_tags_csv
      FROM file_tags ft1
      JOIN file_tags ft2 ON ft1.tag_id = ft2.tag_id
      JOIN files f ON f.id = ft2.file_id
      JOIN tags t ON t.id = ft2.tag_id
      WHERE ft1.file_id = ?
        AND ft2.file_id != ?
      GROUP BY f.id
      ORDER BY shared_tag_count DESC, f.updated_at DESC
      LIMIT ?
      `
    )
    .all(fileId, fileId, limit) as Array<FileRecord & { shared_tag_count: number; shared_tags_csv: string }>;

  return rows.map(({ shared_tags_csv, ...rest }) => ({
    ...rest,
    shared_tags: shared_tags_csv ? shared_tags_csv.split(",") : [],
  }));
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
    INSERT OR IGNORE INTO projects (name, slug, path, description, remote_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(name, slug, path, description || null, remoteUrl || null);
  
  let projectRecord: ProjectRecord;
  if (result.changes > 0) {
    const projectId = Number(result.lastInsertRowid);
    projectRecord = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRecord;
  } else {
    // If ignored, it means name or slug already exists. Fetch the existing one.
    // We prioritize name for lookup.
    projectRecord = db.prepare("SELECT * FROM projects WHERE name = ?").get(name) as ProjectRecord;
  }
  
  return projectRecord;
}

/**
 * Unregister a project and remove all its file metadata
 */
export function unregisterProject(projectId: number, dataDir?: string): void {
  const db = getDatabase();

  // Capture slug before deleting the row — needed for backup subtree cleanup below.
  const project = db.prepare("SELECT slug FROM projects WHERE id = ?").get(projectId) as
    | { slug: string }
    | undefined;

  db.transaction(() => {
    const files = db.prepare("SELECT id FROM files WHERE project_id = ?").all(projectId) as { id: number }[];
    const fileIds = files.map(f => f.id);

    if (fileIds.length > 0) {
      const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
      for (const id of fileIds) {
        deleteFtsStmt.run(id);
      }
      // CASCADE on the files DELETE handles file_tags + favorites.
      db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
    }

    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  })();

  // Outside the txn: remove the backup subtree so re-register doesn't resurrect ghosts.
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
  const foundPaths = new Set<string>();

  // Get all existing files for this project in the DB
  const existingFiles = db.prepare("SELECT path FROM files WHERE project_id = ?").all(projectId) as { path: string }[];
  const existingPaths = new Set(existingFiles.map(f => f.path));

  // Cap size to keep huge files from blowing up memory and the FTS index.
  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB

  // Keep this aligned with the chokidar `ignored` regex in watcher/index.ts.
  const SKIP_DIRS = new Set([
    "node_modules", ".git",
    ".next", ".nuxt", ".cache", ".venv", ".tox", ".gradle", ".idea",
    "dist", "build", "out", "target",
  ]);

  let topLevelWalkOk = false;
  function scanDirectory(dir: string, isTopLevel = false): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
      if (isTopLevel) topLevelWalkOk = true;
    } catch (e) {
      // EACCES, ENOENT, etc. - skip the whole subtree but keep going.
      if (isTopLevel) {
        // Surface this — pruning DB rows on a failed top-level walk would
        // wipe the project's index (and tags/favorites with it).
        throw new Error(`discoverFiles: failed to read project root ${dir}: ${(e as any)?.message ?? e}`);
      }
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
        if (SKIP_DIRS.has(entry)) continue;
        scanDirectory(fullPath, false);
      } else if (lst.isFile() && extname(entry) === ".md") {
        if (lst.size > MAX_FILE_BYTES) {
          console.warn(`discoverFiles: skipping ${fullPath} (size ${lst.size} > ${MAX_FILE_BYTES})`);
          continue;
        }
        
        foundPaths.add(fullPath);

        try {
          const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(fullPath) as { id: number } | undefined;
          if (existing) continue;

          const content = readFileSync(fullPath, "utf8");
          const contentHash = computeHash(content);
          const title = basename(entry, ".md");

          // OR IGNORE so we no-op when the watcher inserted first.
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO files (path, title, project_id, storage_type, content_hash)
            VALUES (?, ?, ?, 'reference', ?)
          `);
          const ftsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");

          db.transaction(() => {
            const result = insertStmt.run(fullPath, title, projectId, contentHash);
            if (result.changes > 0) {
              const fileId = Number(result.lastInsertRowid);
              ftsStmt.run(fileId, title, content);
              const newFile = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRecord;
              discoveredFiles.push(newFile);
            }
          })();
        } catch (e: any) {
          console.error(`discoverFiles: failed to index ${fullPath}:`, e.message);
        }
      }
    }
  }

  scanDirectory(projectPath, true);

  // Prune files that are in the DB but were not found on disk.
  // Skip pruning if the top-level walk failed — a transient EACCES would
  // otherwise wipe the project's index (along with tags/favorites).
  const missingPaths = [...existingPaths].filter(p => !foundPaths.has(p));
  if (missingPaths.length > 0 && topLevelWalkOk) {
    const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
    const deleteFileStmt = db.prepare("DELETE FROM files WHERE id = ?");

    db.transaction(() => {
      for (const path of missingPaths) {
        const file = db.prepare("SELECT id FROM files WHERE path = ?").get(path) as { id: number } | undefined;
        if (file) {
          deleteFtsStmt.run(file.id);
          deleteFileStmt.run(file.id);
        }
      }
    })();
  }

  return discoveredFiles;
}

/**
 * Bulk-fetch tag names for many files in a single query.
 * Returns a Map keyed by file_id; missing keys = file has no tags.
 * Used by list_files / search / whats_new / project_map to inline tags
 * without an N+1 round-trip per file.
 */
export function getTagsForFiles(fileIds: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (fileIds.length === 0) return out;
  const db = getDatabase();
  const placeholders = fileIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT ft.file_id AS file_id, t.name AS name
       FROM file_tags ft
       JOIN tags t ON t.id = ft.tag_id
       WHERE ft.file_id IN (${placeholders})
       ORDER BY t.name ASC`
    )
    .all(...fileIds) as { file_id: number; name: string }[];
  for (const r of rows) {
    const arr = out.get(r.file_id);
    if (arr) arr.push(r.name);
    else out.set(r.file_id, [r.name]);
  }
  return out;
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
