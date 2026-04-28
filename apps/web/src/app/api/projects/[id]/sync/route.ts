import { NextRequest, NextResponse } from "next/server";
import { syncBackup } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  console.log(`[Sync] Starting sync for project ${id}...`);
  try {
    const backedUp = await syncBackup(parseInt(id, 10), DATA_DIR);
    console.log(`[Sync] Completed. Backed up ${backedUp.length} files.`);
    return NextResponse.json({ backed_up: backedUp.length });
  } catch (error: any) {
    console.error(`[Sync] Failed for project ${id}:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
