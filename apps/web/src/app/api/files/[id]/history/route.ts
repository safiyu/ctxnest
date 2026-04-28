import { NextRequest, NextResponse } from "next/server";
import { getHistory, readFile } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  try {
    const file = readFile(parseInt(id, 10));
    if (!file || !file.path) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const history = await getHistory(DATA_DIR, file.path);
    return NextResponse.json(history);
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
