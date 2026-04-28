/**
 * File operations module for CtxNest
 * Handles CRUD operations for .md files with SQLite indexing
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getDatabase } from "../db/index.js";
import type { FileRecord, Destination, FileFilters, StorageType } from "../types.js";

export interface CreateFileOptions {
  title: string;
  content: string;
  destination: Destination;
  projectId?: number;
  folder?: string;
  tags?: string[];
  dataDir: string;
}

export interface FileRecordWithContent extends FileRecord {
  content: string;
}

export interface ListFilesOptions {
  dataDir: string;
  filters?: FileFilters;
}

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
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
 * Create a new file
 */
export function createFile(opts: CreateFileOptions): FileRecordWithContent {
  const db = getDatabase();
  const { title, content, destination, projectId, folder, tags = [], dataDir } = opts;

  // Determine the file path and storage type based on destination
  let filePath: string;
  let storageType: StorageType;

  if (destination === "knowledge") {
    // knowledge → data/knowledge/
    const knowledgeDir = join(dataDir, "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });

    const filename = `${slugify(title)}.md`;
    filePath = folder
      ? join(knowledgeDir, folder, filename)
      : join(knowledgeDir, filename);

    storageType = "local";
  } else if (destination === "ctxnest") {
    // ctxnest → data/projects/{slug}/
    if (!projectId) {
      throw new Error("projectId is required for ctxnest destination");
    }

    const project = db.prepare("SELECT slug FROM projects WHERE id = ?").get(projectId) as { slug: string } | undefined;
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const projectDir = join(dataDir, "projects", project.slug);
    mkdirSync(projectDir, { recursive: true });

    const filename = `${slugify(title)}.md`;
    filePath = folder
      ? join(projectDir, folder, filename)
      : join(projectDir, filename);

    storageType = "local";
  } else if (destination === "project") {
    // project → external project path
    if (!projectId) {
      throw new Error("projectId is required for project destination");
    }

    const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string | null } | undefined;
    if (!project || !project.path) {
      throw new Error(`Project path not found for project: ${projectId}`);
    }

    const filename = `${slugify(title)}.md`;
    filePath = folder
      ? join(project.path, folder, filename)
      : join(project.path, filename);

    storageType = "reference";
  } else {
    throw new Error(`Unknown destination: ${destination}`);
  }

  // Ensure directory exists
  mkdirSync(dirname(filePath), { recursive: true });

  // Write file to disk
  writeFileSync(filePath, content, "utf8");

  // Compute hash
  const contentHash = computeHash(content);

  // Insert into database
  const insertStmt = db.prepare(`
    INSERT INTO files (path, title, project_id, storage_type, content_hash)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(filePath, title, projectId || null, storageType, contentHash);
  const fileId = Number(result.lastInsertRowid);

  // Add tags if provided
  if (tags.length > 0) {
    const insertTagStmt = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
    const getTagStmt = db.prepare("SELECT id FROM tags WHERE name = ?");
    const linkTagStmt = db.prepare("INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)");

    for (const tagName of tags) {
      insertTagStmt.run(tagName);
      const tag = getTagStmt.get(tagName) as { id: number };
      linkTagStmt.run(fileId, tag.id);
    }
  }

  // Insert into FTS5 index
  const ftsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
  ftsStmt.run(fileId, title, content);

  // Retrieve the created record
  const fileRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRecord;

  return {
    ...fileRecord,
    content,
  };
}

/**
 * Read a file by ID
 */
export function readFile(id: number): FileRecordWithContent {
  const db = getDatabase();

  const fileRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord | undefined;
  if (!fileRecord) {
    throw new Error(`File not found: ${id}`);
  }

  const content = readFileSync(fileRecord.path, "utf8");

  return {
    ...fileRecord,
    content,
  };
}

/**
 * Update file content
 */
export function updateFile(id: number, content: string): FileRecord {
  const db = getDatabase();

  const fileRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord | undefined;
  if (!fileRecord) {
    throw new Error(`File not found: ${id}`);
  }

  // Write new content to disk
  writeFileSync(fileRecord.path, content, "utf8");

  // Compute new hash
  const contentHash = computeHash(content);

  // Update database
  const updateStmt = db.prepare(`
    UPDATE files
    SET content_hash = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  updateStmt.run(contentHash, id);

  // Update FTS5 index
  // FTS5 with content='' requires delete using special syntax
  const deleteFtsStmt = db.prepare("INSERT INTO fts_index (fts_index, rowid, title, content) VALUES ('delete', ?, ?, ?)");
  deleteFtsStmt.run(id, fileRecord.title, "");

  const insertFtsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
  insertFtsStmt.run(id, fileRecord.title, content);

  // Return updated record
  const updatedRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord;
  return updatedRecord;
}

/**
 * Delete a file (soft delete from DB)
 */
export function deleteFile(id: number): void {
  const db = getDatabase();

  // Get file info for FTS delete
  const fileRecord = db.prepare("SELECT title FROM files WHERE id = ?").get(id) as { title: string } | undefined;
  if (!fileRecord) {
    throw new Error(`File not found: ${id}`);
  }

  // Delete from FTS5 index using special syntax for content='' tables
  const deleteFtsStmt = db.prepare("INSERT INTO fts_index (fts_index, rowid, title, content) VALUES ('delete', ?, ?, ?)");
  deleteFtsStmt.run(id, fileRecord.title, "");

  // Delete from files table (CASCADE will handle file_tags and favorites)
  const deleteStmt = db.prepare("DELETE FROM files WHERE id = ?");
  deleteStmt.run(id);
}

/**
 * List files with optional filters
 */
export function listFiles(opts: ListFilesOptions): FileRecord[] {
  const db = getDatabase();
  const { filters } = opts;

  let sql = "SELECT * FROM files WHERE 1=1";
  const params: any[] = [];

  if (filters) {
    if (filters.project_id !== undefined) {
      sql += " AND project_id = ?";
      params.push(filters.project_id);
    }

    if (filters.storage_type !== undefined) {
      sql += " AND storage_type = ?";
      params.push(filters.storage_type);
    }

    if (filters.favorite !== undefined && filters.favorite) {
      sql += " AND EXISTS (SELECT 1 FROM favorites WHERE favorites.file_id = files.id)";
    }

    if (filters.tag !== undefined) {
      sql += ` AND EXISTS (
        SELECT 1 FROM file_tags
        JOIN tags ON tags.id = file_tags.tag_id
        WHERE file_tags.file_id = files.id AND tags.name = ?
      )`;
      params.push(filters.tag);
    }

    if (filters.folder !== undefined) {
      sql += " AND path LIKE ?";
      params.push(`%${filters.folder}%`);
    }
  }

  sql += " ORDER BY updated_at DESC";

  if (filters?.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }

  if (filters?.offset !== undefined) {
    sql += " OFFSET ?";
    params.push(filters.offset);
  }

  const stmt = db.prepare(sql);
  return stmt.all(...params) as FileRecord[];
}

/**
 * Move a file to a new path
 */
export function moveFile(id: number, newPath: string): FileRecord {
  const db = getDatabase();

  const fileRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord | undefined;
  if (!fileRecord) {
    throw new Error(`File not found: ${id}`);
  }

  // Ensure destination directory exists
  mkdirSync(dirname(newPath), { recursive: true });

  // Move file on disk
  renameSync(fileRecord.path, newPath);

  // Update path in database
  const updateStmt = db.prepare("UPDATE files SET path = ?, updated_at = datetime('now') WHERE id = ?");
  updateStmt.run(newPath, id);

  // Return updated record
  const updatedRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord;
  return updatedRecord;
}
