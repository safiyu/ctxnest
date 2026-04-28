import { NextRequest, NextResponse } from "next/server";
import { restoreVersion, readFile } from "@ctxnest/core";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  const { hash } = await req.json();

  if (!hash) {
    return NextResponse.json({ error: "Hash is required" }, { status: 400 });
  }

  try {
    const file = readFile(parseInt(id, 10));
    if (!file || !file.path) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = await restoreVersion(DATA_DIR, file.path, hash);
    return NextResponse.json({ success: true, content });
  } catch (error) {
    console.error("Failed to restore version:", error);
    return NextResponse.json({ error: "Failed to restore version" }, { status: 500 });
  }
}
