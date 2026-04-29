import { describe, test, expect } from "vitest";
import { GET } from "./route";
import { createFile } from "@ctxnest/core";
import { ensureDbInitialized } from "@/lib/db-init";

describe("GET /api/files/[id]/download", () => {
  test("streams raw markdown with attachment headers", async () => {
    ensureDbInitialized();
    const dataDir = process.env.CTXNEST_DATA_DIR || "";
    const created = await createFile({
      title: "hello",
      content: "# Hi there",
      destination: "knowledge",
      dataDir,
    });
    const res = await GET(new Request("http://localhost/x") as any, { params: Promise.resolve({ id: String(created.id) }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("hello.md");
    const text = await res.text();
    expect(text).toBe("# Hi there");
  });

  test("404 on unknown id", async () => {
    ensureDbInitialized();
    const res = await GET(new Request("http://localhost/x") as any, { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(404);
  });
});
