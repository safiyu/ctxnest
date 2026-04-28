/**
 * Tests for metadata module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDatabase, closeDatabase, getDatabase } from "../src/db/index.js";
import { createFile } from "../src/files/index.js";
import {
  addTags,
  removeTags,
  setFavorite,
  search,
  registerProject,
  unregisterProject,
  discoverFiles,
  listTags,
  listProjects,
} from "../src/metadata/index.js";

import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "ctxnest-test-"));
const testDir = TEST_DATA_DIR;
const dbPath = join(testDir, "test.db");
const dataDir = join(testDir, "data");

describe("Metadata Module", () => {
  beforeEach(() => {
    // Clean up from previous test
    rmSync(testDir, { recursive: true, force: true });

    // Create test directories
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(dataDir, "knowledge"), { recursive: true });

    // Initialize database
    createDatabase(dbPath);
  });

  afterEach(() => {
    closeDatabase();
  });

  it("addTags: adds tags to a file and verifies via listTags", async () => {
    // Create a test file
    const file = await createFile({
      title: "Test File",
      content: "Test content",
      destination: "knowledge",
      dataDir,
    });

    // Add tags
    addTags(file.id, ["tag1", "tag2"]);

    // Verify tags were created
    const tags = listTags();
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.name)).toContain("tag1");
    expect(tags.map((t) => t.name)).toContain("tag2");

    // Verify tags are linked to the file
    const db = getDatabase();
    const fileTags = db
      .prepare(
        `
      SELECT tags.name FROM file_tags
      JOIN tags ON tags.id = file_tags.tag_id
      WHERE file_tags.file_id = ?
      ORDER BY tags.name
    `
      )
      .all(file.id) as { name: string }[];

    expect(fileTags).toHaveLength(2);
    expect(fileTags[0].name).toBe("tag1");
    expect(fileTags[1].name).toBe("tag2");
  });

  it("removeTags: removes specific tags from a file", async () => {
    // Create a test file
    const file = await createFile({
      title: "Test File",
      content: "Test content",
      destination: "knowledge",
      dataDir,
    });

    // Add two tags
    addTags(file.id, ["tag1", "tag2"]);

    // Get tag IDs
    const db = getDatabase();
    const tag1 = db.prepare("SELECT id FROM tags WHERE name = ?").get("tag1") as { id: number };

    // Remove tag1
    removeTags(file.id, [tag1.id]);

    // Verify only tag2 remains
    const fileTags = db
      .prepare(
        `
      SELECT tags.name FROM file_tags
      JOIN tags ON tags.id = file_tags.tag_id
      WHERE file_tags.file_id = ?
    `
      )
      .all(file.id) as { name: string }[];

    expect(fileTags).toHaveLength(1);
    expect(fileTags[0].name).toBe("tag2");
  });

  it("setFavorite: toggles favorite status", async () => {
    // Create a test file
    const file = await createFile({
      title: "Test File",
      content: "Test content",
      destination: "knowledge",
      dataDir,
    });

    const db = getDatabase();

    // Set as favorite
    setFavorite(file.id, true);

    // Verify in DB
    let favorite = db.prepare("SELECT * FROM favorites WHERE file_id = ?").get(file.id);
    expect(favorite).toBeTruthy();

    // Unset favorite
    setFavorite(file.id, false);

    // Verify removed from DB
    favorite = db.prepare("SELECT * FROM favorites WHERE file_id = ?").get(file.id);
    expect(favorite).toBeUndefined();
  });

  it("search: finds files by content keyword", async () => {
    // Create two files with different content
    const file1 = await createFile({
      title: "File One",
      content: "This file contains the keyword unicorn",
      destination: "knowledge",
      dataDir,
    });

    const file2 = await createFile({
      title: "File Two",
      content: "This file contains different content",
      destination: "knowledge",
      dataDir,
    });

    // Search for "unicorn"
    const results = search({ query: "unicorn" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(file1.id);
    expect(results[0].title).toBe("File One");
    expect(results[0].rank).toBeDefined();
  });

  it("search: finds files by title", async () => {
    // Create files
    await createFile({
      title: "Important Document",
      content: "Some content here",
      destination: "knowledge",
      dataDir,
    });

    await createFile({
      title: "Other File",
      content: "Different content",
      destination: "knowledge",
      dataDir,
    });

    // Search for "Important"
    const results = search({ query: "Important" });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Important Document");
  });

  it("registerProject: creates project with correct slug", async () => {
    // Register project
    const project = registerProject("My Test Project", "/path/to/project", "A test project");

    expect(project.name).toBe("My Test Project");
    expect(project.slug).toBe("my-test-project");
    expect(project.path).toBe("/path/to/project");
    expect(project.description).toBe("A test project");
    expect(project.id).toBeDefined();
    expect(project.created_at).toBeDefined();
  });

  it("unregisterProject: removes project and associated files", async () => {
    // 1. Create a project and some files
    const project = registerProject("Unregister Test", "/tmp/unregister-test");
    
    // Create a mock file in the project
    const db = getDatabase();
    const fileResult = db.prepare(
      "INSERT INTO files (path, title, project_id, storage_type) VALUES (?, ?, ?, 'reference')"
    ).run("/tmp/unregister-test/file.md", "Project File", project.id);
    const fileId = Number(fileResult.lastInsertRowid);
    
    // Index it
    db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)").run(fileId, "Project File", "Test content");

    // 2. Unregister
    unregisterProject(project.id);

    // 3. Verify project is gone
    const projectCheck = db.prepare("SELECT * FROM projects WHERE id = ?").get(project.id);
    expect(projectCheck).toBeUndefined();

    // 4. Verify files are gone
    const fileCheck = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
    expect(fileCheck).toBeUndefined();

    // 5. Verify FTS is gone
    const ftsCheck = search({ query: "Project" });
    expect(ftsCheck).toHaveLength(0);
  });

  it("discoverFiles: finds markdown files in project directory", async () => {
    // Create a temp directory with test files
    const projectPath = join(testDir, "test-project");
    mkdirSync(projectPath, { recursive: true });

    writeFileSync(join(projectPath, "readme.md"), "# README\nProject documentation");
    writeFileSync(join(projectPath, "notes.md"), "# Notes\nSome notes here");
    writeFileSync(join(projectPath, "script.ts"), "// TypeScript file");

    // Register project
    const project = registerProject("Test Project", projectPath);

    // Discover files
    const files = discoverFiles(project.id, dataDir);

    // Should find 2 .md files, not the .ts file
    expect(files).toHaveLength(2);

    const titles = files.map((f) => f.title).sort();
    expect(titles).toEqual(["notes", "readme"]);

    // Verify files have correct properties
    files.forEach((file) => {
      expect(file.project_id).toBe(project.id);
      expect(file.storage_type).toBe("reference");
      expect(file.content_hash).toBeDefined();
    });
  });

  it("listProjects: returns all projects sorted by name", async () => {
    // Register two projects
    registerProject("Zeta Project", "/path/to/zeta");
    registerProject("Alpha Project", "/path/to/alpha");

    // List projects
    const projects = listProjects();

    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe("Alpha Project");
    expect(projects[1].name).toBe("Zeta Project");
  });
});
