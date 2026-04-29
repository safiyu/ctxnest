import { NextResponse } from "next/server";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";
import { syncBackup, listProjects } from "@ctxnest/core";
import { broadcastSync } from "@/lib/websocket";

export async function POST() {
  ensureDbInitialized();
  const start = Date.now();
  broadcastSync({ type: "sync:start", projectId: null, at: start });
  try {
    const projects = listProjects();
    let totalBackedUp = 0;
    const errors: string[] = [];

    for (const project of projects) {
      try {
        const backedUp = await syncBackup(project.id, DATA_DIR, (stage) => {
          broadcastSync({ type: "sync:stage", projectId: project.id, at: Date.now(), stage: `${project.name}: ${stage}` });
        });
        totalBackedUp += backedUp.length;
      } catch (error: any) {
        console.error(`[SyncAll] Failed for project ${project.id}:`, error.message);
        errors.push(`Project ${project.name}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      broadcastSync({
        type: "sync:error",
        projectId: null,
        at: Date.now(),
        message: errors.join("; "),
      });
      return NextResponse.json({
        success: false,
        backed_up: totalBackedUp,
        message: "Partial success. Some projects failed to sync.",
        errors,
      }, { status: 207 });
    }

    broadcastSync({
      type: "sync:done",
      projectId: null,
      at: Date.now(),
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ success: true, backed_up: totalBackedUp });
  } catch (error: any) {
    broadcastSync({
      type: "sync:error",
      projectId: null,
      at: Date.now(),
      message: error.message || "Sync All failed",
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
