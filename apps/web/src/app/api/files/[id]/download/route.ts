import { NextRequest, NextResponse } from "next/server";
import { readFile } from "ctxnest-core";
import { ensureDbInitialized } from "@/lib/db-init";
import { basename } from "node:path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ error: `Invalid id: ${id}` }, { status: 400 });
  }
  let file;
  try {
    file = readFile(n);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const filename = basename(file.path);
  // Quote-escape the filename for the Content-Disposition header.
  const safeName = filename.replace(/"/g, '\\"');
  return new NextResponse(file.content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
