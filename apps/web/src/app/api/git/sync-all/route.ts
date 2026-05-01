import { NextResponse } from "next/server";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";
import { syncBackup, syncGlobalVault, listProjects } from "@ctxnest/core";
import { broadcastSync } from "@/lib/websocket";

export async function POST() {
  ensureDbInitialized();
  const start = Date.now();
  broadcastSync({ type: "sync:start", projectId: null, at: start });
  try {
    const projects = listProjects();
    let totalBackedUp = 0;
    const errors: string[] = [];

    // Cap each project so an unreachable remote can't hang the whole batch.
    const PER_PROJECT_TIMEOUT_MS = Number(process.env.CTXNEST_SYNC_TIMEOUT_MS ?? 60_000);

    for (const project of projects) {
      try {
        const sync = syncBackup(project.id, DATA_DIR, (stage) => {
          broadcastSync({ type: "sync:stage", projectId: project.id, at: Date.now(), stage: `${project.name}: ${stage}` });
        });
        let timedOut = false;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => {
              timedOut = true;
              reject(new Error(`timed out after ${PER_PROJECT_TIMEOUT_MS}ms`));
            },
            PER_PROJECT_TIMEOUT_MS
          )
        );
        try {
          const backedUp = await Promise.race([sync, timeout]);
          totalBackedUp += backedUp.length;
        } finally {
          if (timedOut) {
            // Promise.race doesn't cancel the underlying syncBackup; it
            // keeps running and HOLDS the per-dataDir git lock, so every
            // queued project below will block on it. Warn loudly so users
            // understand subsequent failures are cascading from this hang.
            console.warn(
              `[SyncAll] Project ${project.name} (id=${project.id}) timed out; ` +
                `the underlying syncBackup is still running and will continue to hold the git lock. ` +
                `Subsequent projects in this batch may stall behind it.`
            );
            broadcastSync({
              type: "sync:error",
              projectId: project.id,
              at: Date.now(),
              message: `${project.name}: timeout — sync still running in background, may block remaining projects`,
            });
          }
        }
      } catch (error: any) {
        console.error(`[SyncAll] Failed for project ${project.id}:`, error.message);
        errors.push(`Project ${project.name}: ${error.message}`);
      }
    }

    // Always run a global-vault sync at the end so KB-only commits go
    // upstream even when the user has zero projects (or when they have
    // projects but the per-project pull/push didn't include some
    // KB-only changes — defensive and idempotent).
    try {
      const vaultSync = syncGlobalVault(DATA_DIR, (stage) => {
        broadcastSync({ type: "sync:stage", projectId: null, at: Date.now(), stage: `Knowledge Base: ${stage}` });
      });
      let vaultTimedOut = false;
      const vaultTimeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => {
            vaultTimedOut = true;
            reject(new Error(`KB sync timed out after ${PER_PROJECT_TIMEOUT_MS}ms`));
          },
          PER_PROJECT_TIMEOUT_MS
        )
      );
      try {
        await Promise.race([vaultSync, vaultTimeout]);
      } finally {
        if (vaultTimedOut) {
          console.warn(
            "[SyncAll] Global vault sync timed out; underlying syncGlobalVault is still running and holds the git lock."
          );
        }
      }
    } catch (error: any) {
      console.error("[SyncAll] Global vault sync failed:", error.message);
      errors.push(`Knowledge Base: ${error.message}`);
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
