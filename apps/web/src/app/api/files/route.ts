import { NextRequest, NextResponse } from "next/server";
import { statSync, openSync, readSync, closeSync } from "node:fs";
import { listFiles, createFile } from "@ctxnest/core";
import type { FileFilters } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

// Sample the head to detect ASCII-vs-multi-byte; pick bytes/4 or bytes/3.
function estimateTokens(filePath: string, sizeBytes: number): number {
  if (sizeBytes <= 0) return 1;
  const sampleSize = Math.min(4096, sizeBytes);
  let mostlyAscii = true;
  if (sampleSize >= 256) {
    let fd: number | null = null;
    try {
      fd = openSync(filePath, "r");
      const buf = Buffer.alloc(sampleSize);
      readSync(fd, buf, 0, sampleSize, 0);
      mostlyAscii = buf.toString("utf-8").length > sampleSize * 0.7;
    } catch {} finally {
      if (fd !== null) try { closeSync(fd); } catch {}
    }
  }
  return Math.max(1, Math.ceil(sizeBytes / (mostlyAscii ? 4 : 3)));
}

export async function GET(req: NextRequest) {
  ensureDbInitialized();
  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("project_id");
  const tag = searchParams.get("tag");
  const favorite = searchParams.get("favorite");
  const folder = searchParams.get("folder");

  const filters: FileFilters = {};

  if (projectId !== null) {
    // "none" = KB files (project_id IS NULL); anything else must be a real id.
    if (projectId === "none") {
      filters.project_id = null;
    } else {
      const n = Number(projectId);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: `Invalid project_id: ${projectId}` },
          { status: 400 }
        );
      }
      filters.project_id = n;
    }
  }
  if (tag) filters.tag = tag;
  if (favorite) filters.favorite = favorite === "true";
  if (folder) filters.folder = folder;

  const files = listFiles({ dataDir: DATA_DIR, filters });

  const annotated = files.map((f) => {
    let size_bytes: number | null = null;
    let est_tokens: number | null = null;
    try {
      size_bytes = statSync(f.path).size;
      est_tokens = estimateTokens(f.path, size_bytes);
    } catch {}
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
