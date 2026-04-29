/**
 * Git operations module for CtxNest
 * Handles commit, history, diff, restore, and backup sync operations
 */

import { createHash } from "node:crypto";
import simpleGit, { SimpleGit, LogResult } from "simple-git";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, relative, dirname, isAbsolute, resolve } from "node:path";
import { getDatabase } from "../db/index.js";
import { withLock } from "../util/safety.js";
import type { ProjectRecord, FileRecord } from "../types.js";

// Common env for every git invocation: never prompt for credentials, never
// open a pager/editor, otherwise a stuck child process can hang the request.
function buildGitEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  delete env.PAGER;
  delete env.EDITOR;
  delete env.VISUAL;
  // simple-git's block-unsafe-operations-plugin rejects any operation when
  // these are present in the inherited env. Strip everything it considers
  // unsafe (we never want a credential helper or editor to spawn from a
  // server-side git call).
  for (const k of [
    "GIT_EDITOR",
    "GIT_PAGER",
    "GIT_SEQUENCE_EDITOR",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
    "GIT_PROXY_COMMAND",
    "GIT_HTTP_USER_AGENT",
    "GIT_EXTERNAL_DIFF",
  ]) {
    delete env[k];
  }
  return env;
}

function gitFor(dir: string): SimpleGit {
  return simpleGit(dir).env(buildGitEnv() as any);
}

/** Validate a git remote URL. Allows https://, ssh://, git://, scp-form (user@host:path). */
export function isValidGitRemoteUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) return false;
  if (/[\s\x00-\x1f]/.test(url)) return false;
  // Reject local file paths and dangerous helpers (file://, ext::, etc.)
  if (/^(file|ext):/i.test(url)) return false;
  // scp-form: user@host:path (no scheme)
  if (/^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+:[^\s]+$/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "ssh:" || u.protocol === "git:";
  } catch {
    return false;
  }
}

/**
 * Ensure a directory is a git repository
 * @param dir - Directory path
 */
export async function ensureGitRepo(dir: string): Promise<void> {
  if (existsSync(join(dir, ".git"))) return;

  const git: SimpleGit = gitFor(dir);
  try {
    await git.init();
    await git.addConfig("user.email", "ctxnest@local");
    await git.addConfig("user.name", "CtxNest");
  } catch (error) {
    console.warn(`Failed to initialize git in ${dir}:`, error);
  }
}

/**
 * Commit a file to git repository
 * @param repoDir - Root directory of the git repository
 * @param filePath - Absolute path to the file to commit
 * @param message - Commit message
 */
export async function commitFile(
  repoDir: string,
  filePath: string,
  message: string
): Promise<void> {
  await withLock(`git:${resolve(repoDir)}`, async () => {
    await ensureGitRepo(repoDir);
    const git: SimpleGit = gitFor(repoDir);
    const relativePath = relative(repoDir, filePath);

    await git.add(relativePath);
    // Scope the commit to this file only so concurrent activity in the repo
    // (e.g. an in-flight syncBackup) cannot get swept into the wrong message.
    await git.commit(message, [relativePath], { "--no-verify": null });
  });
}

/**
 * Get commit history for a file
 * @param repoDir - Root directory of the git repository
 * @param filePath - Absolute path to the file
 * @returns Array of commit history objects
 */
export async function getHistory(
  repoDir: string,
  filePath: string
): Promise<Array<{ hash: string; message: string; date: string; author: string }>> {
  const git: SimpleGit = gitFor(repoDir);
  const relativePath = relative(repoDir, filePath);

  const log: LogResult = await git.log({ file: relativePath });

  return log.all.map((commit) => ({
    hash: commit.hash,
    message: commit.message,
    date: commit.date,
    author: commit.author_name,
  }));
}

/**
 * Get diff between two commits for a file
 * @param repoDir - Root directory of the git repository
 * @param filePath - Absolute path to the file
 * @param commitA - First commit hash
 * @param commitB - Second commit hash
 * @returns Diff string
 */
export async function getDiff(
  repoDir: string,
  filePath: string,
  commitA: string,
  commitB: string
): Promise<string> {
  const git: SimpleGit = gitFor(repoDir);
  const relativePath = relative(repoDir, filePath);

  const diff = await git.diff([`${commitA}..${commitB}`, "--", relativePath]);

  return diff;
}

/**
 * Restore a file to a specific commit version
 * @param repoDir - Root directory of the git repository
 * @param filePath - Absolute path to the file
 * @param commitHash - Commit hash to restore from
 * @returns Content of the file at the specified commit
 */
export async function restoreVersion(
  repoDir: string,
  filePath: string,
  commitHash: string
): Promise<string> {
  return await withLock(`git:${resolve(repoDir)}`, async () => {
    const git: SimpleGit = gitFor(repoDir);
    const relativePath = relative(repoDir, filePath);

    const content = await git.show([`${commitHash}:${relativePath}`]);

    // Write the content back to disk
    writeFileSync(filePath, content, "utf8");

    // Sync DB row + FTS index so search and subsequent updates reflect
    // the restored content (otherwise the next updateFile diff is huge
    // and search returns the old text).
    try {
      const db = getDatabase();
      const file = db.prepare("SELECT id, title FROM files WHERE path = ?").get(filePath) as
        | { id: number; title: string }
        | undefined;
      if (file) {
        const hash = createHash("sha256").update(content, "utf8").digest("hex");
        db.prepare("UPDATE files SET content_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
          hash,
          file.id
        );
        db.prepare("DELETE FROM fts_index WHERE rowid = ?").run(file.id);
        db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)").run(
          file.id,
          file.title,
          content
        );
      }
    } catch (e) {
      console.warn("restoreVersion: DB/FTS sync failed:", e);
    }

    // Commit the restore so it appears in history (instead of looking like
    // a fresh edit on the next save).
    try {
      await git.add(relativePath);
      await git.commit(`Restore version ${commitHash.slice(0, 7)}`, [relativePath], { "--no-verify": null });
    } catch (e) {
      // Nothing to commit if content matches HEAD already; ignore.
    }

    return content;
  });
}

/**
 * Sync backup copies of project reference files
 * @param projectId - ID of the project
 * @param dataDir - Data directory path
 * @returns Array of copied file paths
 */
export async function getGlobalRemote(dataDir: string): Promise<string | null> {
  try {
    const git = gitFor(dataDir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    return origin?.refs.fetch || null;
  } catch (error) {
    return null;
  }
}

export async function setGlobalRemote(dataDir: string, url: string): Promise<void> {
  if (url && !isValidGitRemoteUrl(url)) {
    throw new Error("Invalid remote URL: must be https://, ssh://, git://, or user@host:path");
  }
  const git = gitFor(dataDir);
  try {
    await git.status();
  } catch (error) {
    await git.init();
    await git.addConfig("user.email", "ctxnest@local");
    await git.addConfig("user.name", "CtxNest");
  }

  try {
    await git.removeRemote("origin");
  } catch (e) {}

  if (url) {
    await git.addRemote("origin", url);
  }
}

/**
 * Optional per-stage progress callback. Producers (API routes) wire this to
 * a WS broadcast so the UI can show what git is currently doing.
 */
export type SyncStage =
  | "preparing"
  | "staging local"
  | "committing local"
  | "pulling remote"
  | "merging remote"
  | "pushing"
  | "done";

export async function syncBackup(
  projectId: number,
  dataDir: string,
  onStage?: (stage: SyncStage) => void
): Promise<string[]> {
  // Whole sync runs under the per-dataDir git lock so concurrent commitFile
  // calls cannot interleave with the rebuild/pull/push pipeline.
  return await withLock(`git:${resolve(dataDir)}`, () => _syncBackupLocked(projectId, dataDir, onStage));
}

async function _syncBackupLocked(
  projectId: number,
  dataDir: string,
  onStage?: (stage: SyncStage) => void
): Promise<string[]> {
  const stage = (s: SyncStage) => { try { onStage?.(s); } catch {} };
  stage("preparing");
  const db = getDatabase();

  // Get project details
  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRecord | undefined;

  if (!project) {
    throw new Error(`Project with id ${projectId} not found`);
  }

  // Get all reference files for this project
  const files = db
    .prepare("SELECT * FROM files WHERE project_id = ? AND storage_type = 'reference'")
    .all(projectId) as FileRecord[];

  const copiedPaths: string[] = [];
  const backupDir = join(dataDir, "backups", project.slug);

  // Ensure backup directory exists
  mkdirSync(backupDir, { recursive: true });

  const git: SimpleGit = gitFor(dataDir);

  try {
    await git.status();
  } catch (error) {
    // Git repo doesn't exist, initialize it
    await git.init();
    await git.addConfig("user.email", "ctxnest@local");
    await git.addConfig("user.name", "CtxNest");
  }

  // Handle remote pull if remote_url is configured. Ensure remote is set up.
  const globalRemoteUrl = await getGlobalRemote(dataDir);
  if (globalRemoteUrl) {
    if (!isValidGitRemoteUrl(globalRemoteUrl)) {
      throw new Error("Configured global remote URL is not a valid git remote");
    }
    try {
      try {
        await git.removeRemote("origin");
      } catch (e) {}
      await git.addRemote("origin", globalRemoteUrl);

      try {
        await git.raw(["rev-parse", "HEAD"]);
      } catch (e) {
        await git.commit("Initial commit", ["--allow-empty"]);
      }
    } catch (error) {
      console.warn("Git remote setup failed:", error);
    }
  }

  // Capture HEAD before pull so we can ask git which files were actually
  // deleted upstream (instead of inferring it from a snapshot diff, which
  // mis-flags transient local-disk errors as "remote deletion").
  let preHead: string | null = null;
  try {
    preHead = (await git.revparse(["HEAD"])).trim();
  } catch {
    preHead = null;
  }

  // --- STEP 1: COPY LOCAL TRUTH INTO BACKUP DIR ---
  // We rebuild the backup tree from disk every sync, but DO NOT delete DB
  // rows for files that are temporarily missing on disk - that's the
  // dangerous step from the old implementation. If the file is genuinely
  // gone after a sync, the user can unregister/re-register; we won't
  // silently drop their tags/favorites on a transient EACCES.
  stage("staging local");
  try {
    rmSync(backupDir, { recursive: true, force: true });
  } catch (e) {}
  mkdirSync(backupDir, { recursive: true });

  for (const file of files) {
    if (!file.path || !project.path) continue;
    const relativePath = relative(project.path, file.path);
    // Safety check to ensure file is actually inside the project
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      continue;
    }

    if (!existsSync(file.path)) {
      // Skip - do NOT delete the DB row. A transient FS error or a race
      // with the watcher must not cost the user their metadata.
      continue;
    }

    const backupPath = join(backupDir, relativePath);
    mkdirSync(dirname(backupPath), { recursive: true });
    try {
      copyFileSync(file.path, backupPath);
      copiedPaths.push(backupPath);
    } catch (e) {
      console.warn(`syncBackup: failed to copy ${file.path}:`, e);
    }
  }

  const backupRelativeDir = relative(dataDir, backupDir);
  await git.add(["-A", backupRelativeDir]);

  const status = await git.status();
  if (status.staged.length > 0 || status.created.length > 0 || status.deleted.length > 0 || status.modified.length > 0) {
    stage("committing local");
    await git.commit(`Sync local changes for project: ${project.name}`, undefined, { "--no-verify": null });
  }

  // --- STEP 2: PULL REMOTE TRUTH (MERGE) ---
  let pullSucceeded = false;
  if (globalRemoteUrl) {
    stage("pulling remote");
    try {
      await git.pull("origin", "main", { "--rebase": "false" });
      pullSucceeded = true;
      stage("merging remote");
    } catch (e) {
      console.warn("Pull/Merge failed, continuing without remote merge", e);
    }
  }

  // --- STEP 3: SYNC MERGED TRUTH BACK TO LOCAL WORKSPACE ---
  function walkDir(dir: string, fileList: string[] = []) {
    if (!existsSync(dir)) return fileList;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === ".git") continue;
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        walkDir(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const mergedFiles = walkDir(backupDir);
  const existingDbPaths = new Set(files.map((f) => f.path));

  for (const backupPath of mergedFiles) {
    const relativePath = relative(backupDir, backupPath);

    if (project.path) {
      const localAbsolutePath = join(project.path, relativePath);
      // Defense-in-depth: never write outside the project dir.
      const projectResolved = resolve(project.path);
      if (resolve(localAbsolutePath) !== projectResolved && !resolve(localAbsolutePath).startsWith(projectResolved + "/")) {
        continue;
      }
      mkdirSync(dirname(localAbsolutePath), { recursive: true });

      // Copy remote changes back to local project
      try {
        copyFileSync(backupPath, localAbsolutePath);
      } catch (e) {
        console.warn(`syncBackup: failed to write ${localAbsolutePath}:`, e);
        continue;
      }

      // If this file wasn't in the DB, a collaborator added it! Insert it.
      if (!existingDbPaths.has(localAbsolutePath)) {
        const title = relativePath.split("/").pop()?.replace(/\.md$/, "") || "Untitled";
        const content = readFileSync(localAbsolutePath, "utf-8");
        const contentHash = createHash("sha256").update(content).digest("hex");
        const result = db.prepare(
          "INSERT OR IGNORE INTO files (path, title, project_id, storage_type, content_hash) VALUES (?, ?, ?, ?, ?)"
        ).run(localAbsolutePath, title, project.id, "reference", contentHash);

        if (result.changes > 0) {
          db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)").run(result.lastInsertRowid, title, content);
        }
        copiedPaths.push(localAbsolutePath);
      }
    }
  }

  // --- Handle remote deletions: ONLY when git tells us the file was deleted
  // upstream between preHead..HEAD. Never infer from "missing from snapshot",
  // which the old code did and which silently rm'd files in the user's
  // source repo when local copy hiccuped.
  if (pullSucceeded && preHead && project.path) {
    let postHead: string | null = null;
    try {
      postHead = (await git.revparse(["HEAD"])).trim();
    } catch {
      postHead = null;
    }
    if (postHead && postHead !== preHead) {
      let deletedRel: string[] = [];
      try {
        const out = await git.raw([
          "diff",
          "--name-only",
          "--diff-filter=D",
          `${preHead}..${postHead}`,
          "--",
          backupRelativeDir,
        ]);
        deletedRel = out.split("\n").map((s) => s.trim()).filter(Boolean);
      } catch (e) {
        console.warn("syncBackup: failed to diff for deletions:", e);
      }

      const projectResolved = resolve(project.path);
      for (const repoRel of deletedRel) {
        // repoRel is relative to dataDir (e.g. "backups/<slug>/foo/bar.md").
        // Convert to a path relative to the project root.
        const insideBackup = relative(backupRelativeDir, repoRel);
        if (insideBackup.startsWith("..") || isAbsolute(insideBackup)) continue;
        const localAbsolutePath = join(project.path, insideBackup);
        const resolvedLocal = resolve(localAbsolutePath);
        if (resolvedLocal !== projectResolved && !resolvedLocal.startsWith(projectResolved + "/")) {
          continue;
        }
        try {
          if (existsSync(localAbsolutePath)) {
            unlinkSync(localAbsolutePath);
          }
        } catch (e) {
          console.warn(`syncBackup: failed to remove ${localAbsolutePath}:`, e);
        }
        const dbRow = db.prepare("SELECT id FROM files WHERE path = ?").get(localAbsolutePath) as { id: number } | undefined;
        if (dbRow) {
          db.prepare("DELETE FROM fts_index WHERE rowid = ?").run(dbRow.id);
          db.prepare("DELETE FROM files WHERE id = ?").run(dbRow.id);
        }
      }
    }
  }

  // --- STEP 4: PUSH TO GITHUB ---
  if (globalRemoteUrl) {
    stage("pushing");
    try {
      await git.branch(["-M", "main"]);
      await git.push("origin", "main");
    } catch (error: any) {
      console.error("Git push failed:", error);
      throw new Error(`Git push failed: ${error.message}`);
    }
  }

  stage("done");
  return copiedPaths;
}
