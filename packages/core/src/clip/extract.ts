// import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export type ClipErrorCode =
  | "INVALID_URL"
  | "FETCH_FAILED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "EXTRACTION_FAILED";

export class ClipError extends Error {
  constructor(public code: ClipErrorCode, message: string) {
    super(message);
    this.name = "ClipError";
  }
}

const MIN_BODY_CHARS = 200;
const FETCH_TIMEOUT_MS = 10_000;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export interface ExtractResult {
  title: string;
  markdown: string;
}

export async function extractFromHtml(html: string, url: string): Promise<ExtractResult> {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.content || (article.textContent ?? "").trim().length < MIN_BODY_CHARS) {
    throw new ClipError(
      "EXTRACTION_FAILED",
      `Could not extract enough article content from ${url}`
    );
  }

  const markdown = turndown.turndown(article.content);
  const title = (article.title || dom.window.document.title || "").trim() || "Untitled";

  return { title, markdown };
}

export interface FetchResult {
  html: string;
  finalUrl: string;
}

export async function fetchHtml(url: string): Promise<FetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ClipError("INVALID_URL", `Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ClipError("INVALID_URL", `Unsupported protocol: ${parsed.protocol}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "ctxnest-clipper/1.0 (+https://ctxnest.dev)" },
    });
  } catch (e) {
    throw new ClipError("FETCH_FAILED", `Network error fetching ${url}: ${(e as Error).message}`);
  }

  if (!res.ok) {
    throw new ClipError("FETCH_FAILED", `HTTP ${res.status} fetching ${url}`);
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
    throw new ClipError("UNSUPPORTED_CONTENT_TYPE", `Expected text/html, got ${contentType || "(none)"} from ${url}`);
  }

  const html = await res.text();
  return { html, finalUrl: res.url || url };
}
