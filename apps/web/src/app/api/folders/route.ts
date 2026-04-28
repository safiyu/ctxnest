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

  if (projectId && projectId !== "null") {
    const project = db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | undefined;
    if (!project || !project.path) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectPath = project.path;
  } else {
    projectPath = join(DATA_DIR, "knowledge");
  }

  try {
    const { deleteFolder } = await import("@ctxnest/core");
    
    if (!projectId || projectId === "null") {
      // Knowledge Base: Safe to delete physically
      deleteFolder(projectPath, folderName);
    } else {
      // Project: DO NOT delete physically. Only un-index files in this folder.
      const normalizedFolder = folderName.endsWith("/") ? folderName : folderName + "/";
      const db = getDatabase();
      db.prepare("DELETE FROM files WHERE project_id = ? AND path LIKE ?").run(projectId, `%/${normalizedFolder}%`);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ 
      error: error.code === "ENOTEMPTY" ? "Folder is not empty" : "Failed to delete folder" 
    }, { status: 400 });
  }
}

