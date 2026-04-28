import { NextResponse } from "next/server";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";
import { syncBackup, listProjects } from "@ctxnest/core";

export async function POST() {
  ensureDbInitialized();
  try {
    const projects = listProjects();
    let totalBackedUp = 0;
    const errors: string[] = [];

    for (const project of projects) {
      try {
        const backedUp = await syncBackup(project.id, DATA_DIR);
        totalBackedUp += backedUp.length;
      } catch (error: any) {
        console.error(`[SyncAll] Failed for project ${project.id}:`, error.message);
        errors.push(`Project ${project.name}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ 
        success: false, 
        backed_up: totalBackedUp,
        message: "Partial success. Some projects failed to sync.",
        errors 
      }, { status: 207 }); // 207 Multi-Status
    }

    return NextResponse.json({ success: true, backed_up: totalBackedUp });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
