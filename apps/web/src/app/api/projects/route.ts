import { NextRequest, NextResponse } from "next/server";
import { listProjects, registerProject, discoverFiles } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function GET() {
  ensureDbInitialized();
  const projects = listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  ensureDbInitialized();
  const body = await req.json();
  const project = registerProject(body.name, body.path, body.description);
  const discoveredFiles = discoverFiles(project.id, DATA_DIR);
  return NextResponse.json({
    project,
    discovered_files: discoveredFiles.length,
  }, { status: 201 });
}
