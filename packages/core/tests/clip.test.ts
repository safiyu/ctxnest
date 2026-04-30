import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { createDatabase, closeDatabase } from "../src/db/index.js";
import { listFiles, readFile } from "../src/files/index.js";
import { clipUrl } from "../src/clip/index.js";
import * as extract from "../src/clip/extract.js";

const ARTICLE_HTML = `<!doctype html><html><head><title>T</title></head>
<body><article><h1>H</h1><p>${"body ".repeat(60)}</p></article></body></html>`;

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "ctxnest-clip-"));
  mkdirSync(join(dataDir, "knowledge"), { recursive: true });
  createDatabase(join(dataDir, "test.db"));
});
afterEach(() => {
  closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("clipUrl", () => {
  it("creates a new file under knowledge/urlclips with frontmatter and source_path set", async () => {
    vi.spyOn(extract, "fetchHtml").mockResolvedValue({ html: ARTICLE_HTML, finalUrl: "https://example.com/a" });
    const file = await clipUrl({ url: "https://example.com/a", dataDir });
    expect(file.path).toContain(`knowledge${sep}urlclips${sep}`);
    expect(file.source_path).toBe("https://example.com/a");
    expect(file.content).toContain("source: https://example.com/a");
    expect(file.content).toContain("# H");
  });

  it("on second clip with identical content, returns existing record without writing", async () => {
    vi.spyOn(extract, "fetchHtml").mockResolvedValue({ html: ARTICLE_HTML, finalUrl: "https://example.com/a" });
    const first = await clipUrl({ url: "https://example.com/a", dataDir });
    const second = await clipUrl({ url: "https://example.com/a", dataDir });
    expect(second.id).toBe(first.id);
    const all = listFiles({ dataDir });
    expect(all.filter((f) => f.source_path === "https://example.com/a")).toHaveLength(1);
  });

  it("on second clip with changed content, updates existing file", async () => {
    const spy = vi.spyOn(extract, "fetchHtml");
    spy.mockResolvedValueOnce({ html: ARTICLE_HTML, finalUrl: "https://example.com/a" });
    const first = await clipUrl({ url: "https://example.com/a", dataDir });

    const newer = ARTICLE_HTML.replace("body ", "updated ");
    spy.mockResolvedValueOnce({ html: newer, finalUrl: "https://example.com/a" });
    const second = await clipUrl({ url: "https://example.com/a", dataDir });

    expect(second.id).toBe(first.id);
    const fresh = readFile(first.id);
    expect(fresh.content).toContain("updated");
  });

  it("uses post-redirect finalUrl for dedup", async () => {
    vi.spyOn(extract, "fetchHtml").mockResolvedValue({ html: ARTICLE_HTML, finalUrl: "https://example.com/canonical" });
    const file = await clipUrl({ url: "https://example.com/redirect", dataDir });
    expect(file.source_path).toBe("https://example.com/canonical");
  });
});
