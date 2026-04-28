import { NextRequest, NextResponse } from "next/server";
import { createFolder, getDatabase, listProjectFolders } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";
import { join } from "node:path";

export async function POST(req: NextRequest) {
  ensureDbInitialized();
  const { projectId, name } = await req.json();
  const db = getDatabase();

  let projectPath: string;

  if (projectId) {
    const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | undefined;
    if (!project || !project.path) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectPath = project.path;
  } else {
    // Default to knowledge base path
    projectPath = join(DATA_DIR, "knowledge");
  }

  const path = createFolder(projectPath, name);
  return NextResponse.json({ path });
}

export async function GET(req: NextRequest) {
  ensureDbInitialized();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const db = getDatabase();

  let projectPath: string;

  if (projectId) {
    const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | undefined;
    if (!project || !project.path) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectPath = project.path;
  } else {
    projectPath = join(DATA_DIR, "knowledge");
  }

  const folders = listProjectFolders(projectPath);
  return NextResponse.json(folders);
}
