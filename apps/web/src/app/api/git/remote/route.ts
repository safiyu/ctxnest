import { NextResponse } from "next/server";
import { DATA_DIR, ensureDbInitialized } from "@/lib/db-init";
import { getGlobalRemote, setGlobalRemote } from "@ctxnest/core";

export async function GET() {
  ensureDbInitialized();
  try {
    const url = await getGlobalRemote(DATA_DIR);
    return NextResponse.json({ remote_url: url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  ensureDbInitialized();
  try {
    const { remote_url } = await request.json();
    await setGlobalRemote(DATA_DIR, remote_url);
    return NextResponse.json({ success: true, remote_url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
