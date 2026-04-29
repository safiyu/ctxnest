import { NextRequest, NextResponse } from "next/server";
import { createFolder, getDatabase, listProjectFolders } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";
import { join } from "node:path";

export async function POST(req: NextRequest) {
  ensureDbInitialized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const { projectId, name } = (body as { projectId?: unknown; name?: unknown }) ?? {};

  if (typeof name !== "string" || name.length === 0) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }
  if (
    projectId !== undefined &&
    projectId !== null &&
    (typeof projectId !== "number" || !Number.isInteger(projectId) || projectId < 0)
  ) {
    return NextResponse.json({ error: "projectId must be a non-negative integer" }, { status: 400 });
  }

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
  try {
    const path = createFolder(projectPath, name);
    return NextResponse.json({ path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid folder name" }, { status: 400 });
  }
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
  return NextResponse.json({ folders, basePath: projectPath });
}


export async function DELETE(req: NextRequest) {
  ensureDbInitialized();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const folderName = searchParams.get("name");

  if (!folderName) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }

  const db = getDatabase();
  let projectPath: string;

  // Coerce projectId to a number; treat "null"/missing/non-numeric as "no project".
  const projectIdNum =
    projectId && projectId !== "null" && Number.isFinite(Number(projectId))
      ? Number(projectId)
      : null;

  if (projectIdNum !== null) {
    const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectIdNum) as { path: string } | undefined;
    if (!project || !project.path) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectPath = project.path;
  } else {
    projectPath = join(DATA_DIR, "knowledge");
  }

  try {
    const { deleteFolder } = await import("@ctxnest/core");

    if (projectIdNum === null) {
      // KB folder — safe to delete from disk.
      deleteFolder(projectPath, folderName);
    } else {
      // Project folder — only un-index. Never touch the source repo.
      const { resolve, sep } = await import("node:path");
      const baseResolved = resolve(projectPath);
      const target = resolve(baseResolved, folderName);
      if (target !== baseResolved && !target.startsWith(baseResolved + sep)) {
        return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
      }
      const folderPrefix = target.endsWith(sep) ? target : target + sep;
      const escaped = folderPrefix.replace(/[\\%_]/g, (ch) => "\\" + ch);
      const db = getDatabase();
      db.prepare("DELETE FROM files WHERE project_id = ? AND path LIKE ? ESCAPE '\\'").run(
        projectIdNum,
        `${escaped}%`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ 
      error: error.code === "ENOTEMPTY" ? "Folder is not empty" : "Failed to delete folder" 
    }, { status: 400 });
  }
}

