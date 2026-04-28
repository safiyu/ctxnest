import { NextRequest, NextResponse } from "next/server";
import { search } from "@ctxnest/core";
import { ensureDbInitialized } from "@/lib/db-init";

export async function GET(req: NextRequest) {
  ensureDbInitialized();
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json([]);
  }

  const results = search({ query: q });
  return NextResponse.json(results);
}
