/**
 * Git operations module for CtxNest
 * Handles commit, history, diff, restore, and backup sync operations
 */

import { createHash } from "node:crypto";
import simpleGit, { SimpleGit, LogResult } from "simple-git";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, relative, dirname, isAbsolute } from "node:path";
import { getDatabase } from "../db/index.js";
import type { ProjectRecord, FileRecord } from "../types.js";

/**
 * Ensure a directory is a git repository
 * @param dir - Directory path
 */
export async function ensureGitRepo(dir: string): Promise<void> {
  if (existsSync(join(dir, ".git"))) return;

  const git: SimpleGit = simpleGit(dir);
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
  await ensureGitRepo(repoDir);
  const git: SimpleGit = simpleGit(repoDir);
  const relativePath = relative(repoDir, filePath);

  await git.add(relativePath);
  await git.commit(message, ["--no-verify"]);
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
  const git: SimpleGit = simpleGit(repoDir);
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
  const git: SimpleGit = simpleGit(repoDir);
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
  const git: SimpleGit = simpleGit(repoDir);
  const relativePath = relative(repoDir, filePath);

  const content = await git.show([`${commitHash}:${relativePath}`]);

  // Write the content back to disk
  writeFileSync(filePath, content, "utf8");

  return content;
}

/**
 * Sync backup copies of project reference files
 * @param projectId - ID of the project
 * @param dataDir - Data directory path
 * @returns Array of copied file paths
 */
export async function getGlobalRemote(dataDir: string): Promise<string | null> {
  try {
    const git = simpleGit(dataDir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    return origin?.refs.fetch || null;
  } catch (error) {
    return null;
  }
}

export async function setGlobalRemote(dataDir: string, url: string): Promise<void> {
  const git = simpleGit(dataDir);
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

export async function syncBackup(
  projectId: number,
  dataDir: string
): Promise<string[]> {
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

  // Initialize git if not already initialized
  const git: SimpleGit = simpleGit(dataDir).env({
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  });

  try {
    await git.status();
  } catch (error) {
    // Git repo doesn't exist, initialize it
    await git.init();
    await git.addConfig("user.email", "ctxnest@local");
    await git.addConfig("user.name", "CtxNest");
  }

  // Handle remote pull if remote_url is configured
  // Ensure remote is set up
  if (project.remote_url) {
    try {
      try {
        await git.removeRemote("origin");
      } catch (e) {}
      await git.addRemote("origin", project.remote_url);

      try {
        await git.raw(["rev-parse", "HEAD"]);
      } catch (e) {
        await git.commit("Initial commit", ["--allow-empty"]);
      }
    } catch (error) {
      console.warn("Git remote setup failed:", error);
    }
  }

  // --- STEP 1: COMMIT LOCAL TRUTH TO GIT ---
  try {
    rmSync(backupDir, { recursive: true, force: true });
  } catch (e) {}
  mkdirSync(backupDir, { recursive: true });

  for (const file of files) {
    if (!file.path || !project.path) continue;
    // Keep relative folder structure!
    const relativePath = relative(project.path, file.path);
    // Safety check to ensure file is actually inside the project
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      continue; 
    }
    const backupPath = join(backupDir, relativePath);

    mkdirSync(dirname(backupPath), { recursive: true });
    copyFileSync(file.path, backupPath);
  }

  const backupRelativeDir = relative(dataDir, backupDir);
  await git.add(["-A", backupRelativeDir]);
  
  const status = await git.status();
  if (status.staged.length > 0 || status.created.length > 0 || status.deleted.length > 0 || status.modified.length > 0) {
    await git.commit(`Sync local changes for project: ${project.name}`, ["--no-verify"]);
  }

  // --- STEP 2: PULL REMOTE TRUTH (MERGE) ---
  if (project.remote_url) {
    try {
      // Rebase=false to force a true merge commit if both ends changed files
      await git.pull("origin", "main", { "--rebase": "false" }).catch((e) => {
        console.warn("Pull/Merge failed, continuing anyway", e);
      });
    } catch (e) {}
  }

  // --- STEP 3: SYNC MERGED TRUTH BACK TO LOCAL WORKSPACE ---
  // Recursively read the merged backup directory
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
  const mergedBackupRelativePaths = new Set<string>();

  for (const backupPath of mergedFiles) {
    const relativePath = relative(backupDir, backupPath);
    mergedBackupRelativePaths.add(relativePath);
    
    if (project.path) {
      const localAbsolutePath = join(project.path, relativePath);
      mkdirSync(dirname(localAbsolutePath), { recursive: true });
      
      // Copy remote changes back to local project
      copyFileSync(backupPath, localAbsolutePath);
      
      // If this file wasn't in the DB, a collaborator added it! Insert it.
      if (!existingDbPaths.has(localAbsolutePath)) {
        const title = relativePath.split("/").pop()?.replace(/\.md$/, "") || "Untitled";
        const contentHash = createHash("md5").update(readFileSync(localAbsolutePath)).digest("hex");
        db.prepare(
          "INSERT INTO files (path, title, project_id, storage_type, content_hash) VALUES (?, ?, ?, ?, ?)"
        ).run(localAbsolutePath, title, project.id, "reference", contentHash);
        copiedPaths.push(localAbsolutePath);
      }
    }
  }

  // Handle Remote Deletions
  for (const file of files) {
    if (!file.path || !project.path) continue;
    const relativePath = relative(project.path, file.path);
    
    // If a database file is NOT in the newly merged backupDir, it was deleted on GitHub!
    if (!mergedBackupRelativePaths.has(relativePath)) {
      try {
        if (existsSync(file.path)) {
          unlinkSync(file.path);
        }
      } catch (e) {}
      // Remove from Database
      db.prepare("DELETE FROM files WHERE id = ?").run(file.id);
    }
  }

  // --- STEP 4: PUSH TO GITHUB ---
  if (project.remote_url) {
    try {
      await git.branch(["-M", "main"]);
      await git.push("origin", "main");
    } catch (error: any) {
      console.error("Git push failed:", error);
      throw new Error(`Git push failed: ${error.message}`);
    }
  }

  return copiedPaths;
}
