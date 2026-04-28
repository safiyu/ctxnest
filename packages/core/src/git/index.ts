/**
 * Git operations module for CtxNest
 * Handles commit, history, diff, restore, and backup sync operations
 */

import simpleGit, { SimpleGit, LogResult } from "simple-git";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { getDatabase } from "../db/index.js";
import type { ProjectRecord, FileRecord } from "../types.js";

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
  const git: SimpleGit = simpleGit(dataDir);

  try {
    await git.status();
  } catch (error) {
    // Git repo doesn't exist, initialize it
    await git.init();
    await git.addConfig("user.email", "ctxnest@local");
    await git.addConfig("user.name", "CtxNest");
  }

  // Copy each reference file to backup directory
  for (const file of files) {
    if (!file.source_path) {
      continue;
    }

    const fileName = file.source_path.split("/").pop() || "unknown";
    const backupPath = join(backupDir, fileName);

    // Ensure subdirectory exists
    mkdirSync(dirname(backupPath), { recursive: true });

    // Copy file
    copyFileSync(file.source_path, backupPath);
    copiedPaths.push(backupPath);
  }

  // Git add and commit
  if (copiedPaths.length > 0) {
    const relativePaths = copiedPaths.map((p) => relative(dataDir, p));
    await git.add(relativePaths);
    await git.commit(`Backup sync for project: ${project.name}`, ["--no-verify"]);
  }

  return copiedPaths;
}
