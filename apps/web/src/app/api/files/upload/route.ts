import { NextRequest, NextResponse } from "next/server";
import { createFile, listFiles } from "@ctxnest/core";
import { ensureDbInitialized, DATA_DIR } from "@/lib/db-init";
import { basename, extname } from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set([".md", ".markdown"]);

interface UploadedItem {
  id: number;
  path: string;
  original_name: string;
  final_name: string;
}
interface RejectedItem { name: string; reason: string }

function nextAvailableName(existingBasenames: Set<string>, desired: string): string {
  if (!existingBasenames.has(desired)) return desired;
  const ext = extname(desired);
  const stem = desired.slice(0, -ext.length);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!existingBasenames.has(candidate)) return candidate;
  }
  // Fall back to timestamp if 1000 collisions (effectively impossible).
  return `${stem}-${Date.now()}${ext}`;
}

export async function POST(req: NextRequest) {
  ensureDbInitialized();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body must be multipart/form-data" }, { status: 400 });
  }

  const projectIdRaw = form.get("project_id");
  const folder = (form.get("folder") as string | null) ?? "";
  const tagsRaw = form.get("tags") as string | null;
  const files = form.getAll("files").filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  let projectId: number | undefined;
  if (typeof projectIdRaw === "string" && projectIdRaw !== "") {
    const n = Number(projectIdRaw);
    // SQLite AUTOINCREMENT starts at 1; reject 0 explicitly so it doesn't fall
    // through the truthy `projectId ? "project" : "knowledge"` check below.
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "Invalid project_id" }, { status: 400 });
    }
    projectId = n;
  }

  let tags: string[] | undefined;
  if (tagsRaw) {
    try {
      const parsed = JSON.parse(tagsRaw);
      if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
        tags = parsed;
      }
    } catch {
      return NextResponse.json({ error: "tags must be a JSON array of strings" }, { status: 400 });
    }
  }

  const destination = projectId ? "project" : "knowledge";

  const existing = listFiles({
    dataDir: DATA_DIR,
    filters: { project_id: projectId ?? null, folder: folder || undefined },
  });
  const existingBasenames = new Set<string>(existing.map((f) => basename(f.path)));

  const uploaded: UploadedItem[] = [];
  const rejected: RejectedItem[] = [];

  for (const file of files) {
    const original = file.name;
    const ext = extname(original).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      rejected.push({ name: original, reason: "unsupported_extension" });
      continue;
    }
    if (file.size > MAX_BYTES) {
      rejected.push({ name: original, reason: "too_large" });
      continue;
    }

    const finalName = nextAvailableName(existingBasenames, original);
    existingBasenames.add(finalName);

    const content = await file.text();
    const stem = finalName.slice(0, -extname(finalName).length);

    try {
      const created = await createFile({
        title: stem,
        content,
        destination,
        projectId,
        folder: folder || undefined,
        tags,
        dataDir: DATA_DIR,
      });
      uploaded.push({ id: created.id, path: created.path, original_name: original, final_name: finalName });
    } catch (e: any) {
      rejected.push({ name: original, reason: `create_failed: ${e?.message ?? String(e)}` });
    }
  }

  return NextResponse.json({ uploaded, rejected });
}
