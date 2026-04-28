import { NextRequest, NextResponse } from "next/server";
import { syncBackup } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  const backedUp = await syncBackup(parseInt(id, 10), DATA_DIR);
  return NextResponse.json({ backed_up: backedUp.length });
}
