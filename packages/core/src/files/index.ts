/**
 * File operations module for CtxNest
 * Handles CRUD operations for .md files with SQLite indexing
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, renameSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { getDatabase } from "../db/index.js";
import { commitFile } from "../git/index.js";
import { assertPathInside, escapeLike } from "../util/safety.js";
import type { FileRecord, Destination, FileFilters, StorageType } from "../types.js";

/**
 * List all folders in a project (recursively)
 */
export function listProjectFolders(projectPath: string): string[] {
  const folders: string[] = [];
  
  function scan(dir: string, currentRel: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      
      const fullPath = join(dir, entry);
      const relPath = currentRel ? join(currentRel, entry) : entry;
      
      try {
        if (statSync(fullPath).isDirectory()) {
          folders.push(relPath);
          scan(fullPath, relPath);
        }
      } catch (e) {
        // Skip files that might have been deleted during scan
      }
    }
  }

  try {
    scan(projectPath, "");
  } catch (e) {
    console.error("Failed to scan project folders:", e);
  }
  
  return folders;
}

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
export async function createFile(opts: CreateFileOptions): Promise<FileRecordWithContent> {
  const db = getDatabase();
  const { title, content, destination, projectId, folder, tags = [], dataDir } = opts;

  // Determine the file path and storage type based on destination
  let filePath: string;
  let storageType: StorageType;

  const slug = slugify(title);
  if (!slug) {
    throw new Error("Invalid title: produces empty slug");
  }
  const filename = `${slug}.md`;

  if (destination === "knowledge") {
    // knowledge → data/knowledge/
    const knowledgeDir = join(dataDir, "knowledge");
    mkdirSync(knowledgeDir, { recursive: true });
    filePath = folder
      ? assertPathInside(knowledgeDir, join(folder, filename))
      : assertPathInside(knowledgeDir, filename);
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
    filePath = folder
      ? assertPathInside(projectDir, join(folder, filename))
      : assertPathInside(projectDir, filename);
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

    filePath = folder
      ? assertPathInside(project.path, join(folder, filename))
      : assertPathInside(project.path, filename);
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

  // Automatic Versioning: Commit new file to Git
  try {
    let repoDir = dataDir;
    // If it's a reference file in an external project, commit to the project's own git
    if (storageType === "reference" && projectId) {
      const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string | null } | undefined;
      if (project?.path) {
        repoDir = project.path;
      }
    }
    await commitFile(repoDir, filePath, `Create context file: ${title}`);
  } catch (error) {
    console.warn("Git auto-commit failed during creation:", error);
  }

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
export async function updateFile(id: number, content: string, dataDir: string): Promise<FileRecordWithContent> {
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
  const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
  deleteFtsStmt.run(id);

  const insertFtsStmt = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
  insertFtsStmt.run(id, fileRecord.title, content);

  // Automatic Versioning: Commit update to Git
  try {
    let repoDir = dataDir;
    // If it's a reference file in an external project, commit to the project's own git
    if (fileRecord.storage_type === "reference" && fileRecord.project_id) {
      const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(fileRecord.project_id) as { path: string | null } | undefined;
      if (project?.path) {
        repoDir = project.path;
      }
    }
    await commitFile(repoDir, fileRecord.path, `Update context file: ${fileRecord.title}`);
  } catch (error) {
    console.warn("Git auto-commit failed during update:", error);
  }

  // Return updated record
  const updatedRecord = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord;
  return {
    ...updatedRecord,
    content,
  };
}

/**
 * Delete a file (DB and disk)
 */
export function deleteFile(id: number): void {
  const db = getDatabase();

  // Get file info first
  const file = db.prepare("SELECT path, storage_type FROM files WHERE id = ?").get(id) as { path: string, storage_type: string } | undefined;
  
  if (file) {
    // Safety: We only physically delete files from the Knowledge Base (where project_id is null).
    // For project files, we only "un-index" them from the database to avoid accidental data loss in the project repo.
    const dbRecord = db.prepare("SELECT project_id FROM files WHERE id = ?").get(id) as { project_id: number | null } | undefined;
    
    if (dbRecord && dbRecord.project_id === null) {
      try {
        if (existsSync(file.path)) {
          unlinkSync(file.path);
        }
      } catch (e) {
        console.error("Failed to delete Knowledge Base file from disk:", e);
      }
    }
  }

  // Delete from FTS5 index
  const deleteFtsStmt = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
  deleteFtsStmt.run(id);

  // Delete from files table (CASCADE will handle file_tags and favorites)
  const deleteStmt = db.prepare("DELETE FROM files WHERE id = ?");
  deleteStmt.run(id);
}

/**
 * Create a new folder in a project
 */
export function createFolder(projectPath: string, folderName: string): string {
  const fullPath = assertPathInside(projectPath, folderName);
  mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

/**
 * Delete a folder (recursive)
 */
export function deleteFolder(projectPath: string, folderName: string): void {
  const fullPath = assertPathInside(projectPath, folderName);
  rmSync(fullPath, { recursive: true, force: true });
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
      if (filters.project_id === null) {
        sql += " AND project_id IS NULL";
      } else {
        sql += " AND project_id = ?";
        params.push(filters.project_id);
      }
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
      sql += " AND path LIKE ? ESCAPE '\\'";
      params.push(`%${escapeLike(filters.folder)}%`);
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
