import { NextRequest, NextResponse } from "next/server";
import { discoverFiles } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  const projectIdNum = parseInt(id, 10);
  
  try {
    const discoveredFiles = discoverFiles(projectIdNum, DATA_DIR);
    return NextResponse.json({
      success: true,
      discovered_count: discoveredFiles.length,
    });
  } catch (error: any) {
    console.error(`[Refresh] Failed for project ${id}:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
