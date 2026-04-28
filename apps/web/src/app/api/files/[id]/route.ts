import { NextRequest, NextResponse } from "next/server";
import { readFile, updateFile, deleteFile } from "@ctxnest/core";
import { ensureDbInitialized } from "@/lib/db-init";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  try {
    const file = readFile(parseInt(id, 10));
    return NextResponse.json(file);
  } catch (error) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = updateFile(parseInt(id, 10), body.content);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDbInitialized();
  const { id } = await params;
  deleteFile(parseInt(id, 10));
  return NextResponse.json({ success: true });
}
