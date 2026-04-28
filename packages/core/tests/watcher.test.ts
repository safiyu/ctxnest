import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, closeDatabase } from "../src/db/index.js";
import { createFileWatcher, type WatcherEvent } from "../src/watcher/index.js";
import { createFile } from "../src/files/index.js";
import fs from "node:fs";
import path from "node:path";

const TEST_DB = path.join(import.meta.dirname, "test-watcher.db");
const TEST_DATA = path.join(import.meta.dirname, "test-watch-data");

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_DATA, "knowledge"), { recursive: true });
  createDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_DATA)) fs.rmSync(TEST_DATA, { recursive: true });
});

describe("watcher", () => {
  it("emits change event when a tracked file is modified", async () => {
    const file = await createFile({
      title: "Watched",
      content: "original",
      destination: "knowledge",
      dataDir: TEST_DATA,
    });

    const events: WatcherEvent[] = [];
    const watcher = createFileWatcher([TEST_DATA], (event) => events.push(event));

    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(file.path, "modified content");
    await new Promise((r) => setTimeout(r, 1500));

    await watcher.close();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "change")).toBe(true);
  });

  it("can be closed without errors", async () => {
    const watcher = createFileWatcher([TEST_DATA], () => {});
    await new Promise((r) => setTimeout(r, 200));
    await expect(watcher.close()).resolves.not.toThrow();
  });
});
