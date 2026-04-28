import { NextRequest, NextResponse } from "next/server";
import { listFiles, createFile } from "@ctxnest/core";
import type { FileFilters } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function GET(req: NextRequest) {
  ensureDbInitialized();
  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("projectId");
  const tag = searchParams.get("tag");

  const filters: FileFilters = {};
  if (projectId) filters.project_id = parseInt(projectId, 10);
  if (tag) filters.tag = tag;

  const files = listFiles({ dataDir: DATA_DIR, filters });
  return NextResponse.json(files);
}

export async function POST(req: NextRequest) {
  ensureDbInitialized();
  const body = await req.json();
  const file = createFile({ ...body, dataDir: DATA_DIR });
  return NextResponse.json(file, { status: 201 });
}
