import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@ctxnest/core";
import { ensureDbInitialized } from "@/lib/db-init";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  const body = await req.json();
  const db = getDatabase();

  if (body.remote_url !== undefined) {
    db.prepare("UPDATE projects SET remote_url = ? WHERE id = ?").run(
      body.remote_url,
      parseInt(id, 10)
    );
  }

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(parseInt(id, 10));
  return NextResponse.json(project);
}
