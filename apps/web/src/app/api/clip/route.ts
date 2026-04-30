import { NextResponse } from "next/server";
import { clipUrl, ClipError, type ClipErrorCode } from "@ctxnest/core";
import { ensureDbInitialized, DATA_DIR } from "@/lib/db-init";

const STATUS_FOR_CODE: Record<ClipErrorCode, number> = {
  INVALID_URL: 400,
  FETCH_FAILED: 502,
  UNSUPPORTED_CONTENT_TYPE: 422,
  EXTRACTION_FAILED: 422,
};

export async function POST(req: Request) {
  ensureDbInitialized();

  let body: { url?: unknown; title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url : "";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;
  if (!url) {
    return NextResponse.json({ error: "Missing 'url' field" }, { status: 400 });
  }

  try {
    const file = await clipUrl({ url, title, dataDir: DATA_DIR });
    return NextResponse.json(file);
  } catch (e) {
    if (e instanceof ClipError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: STATUS_FOR_CODE[e.code] ?? 500 }
      );
    }
    return NextResponse.json({ error: (e as Error).message ?? "Internal error" }, { status: 500 });
  }
}
