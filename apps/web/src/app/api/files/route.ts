import { NextRequest, NextResponse } from "next/server";
import { statSync } from "node:fs";
import { listFiles, createFile } from "@ctxnest/core";
import type { FileFilters } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function GET(req: NextRequest) {
  ensureDbInitialized();
  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("project_id");
  const tag = searchParams.get("tag");
  const favorite = searchParams.get("favorite");
  const folder = searchParams.get("folder");

  const filters: FileFilters = {};

  if (projectId !== null) {
    // "none" means explicitly filter for KB files (no project)
    // Any number means filter by that project ID
    filters.project_id = projectId === "none" ? null : parseInt(projectId, 10);
  }
  if (tag) filters.tag = tag;
  if (favorite) filters.favorite = favorite === "true";
  if (folder) filters.folder = folder;

  const files = listFiles({ dataDir: DATA_DIR, filters });

  // Annotate each row with size_bytes + est_tokens (heuristic: bytes / 4
  // is within ~10% for English/code; cheap, no tokenizer dependency).
  // Best-effort: a missing file (transient delete) reports nulls rather
  // than failing the whole list.
  const annotated = files.map((f) => {
    let size_bytes: number | null = null;
    try {
      size_bytes = statSync(f.path).size;
    } catch {}
    const est_tokens =
      size_bytes !== null ? Math.max(1, Math.ceil(size_bytes / 4)) : null;
    return { ...f, size_bytes, est_tokens };
  });

  return NextResponse.json(annotated);
}

export async function POST(req: NextRequest) {
  ensureDbInitialized();
  const body = await req.json();
  const file = await createFile({ ...body, dataDir: DATA_DIR });
  return NextResponse.json(file, { status: 201 });
}
