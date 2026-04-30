// import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export type ClipErrorCode =
  | "INVALID_URL"
  | "FETCH_FAILED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "EXTRACTION_FAILED"
  | "AUTH_REQUIRED";

export interface ClipErrorDetails {
  loginUrl?: string;
  wwwAuthenticate?: string;
  signal?: AuthSignal;
}

export type AuthSignal =
  | "http_401"
  | "http_403"
  | "redirect_to_login"
  | "login_page_body";

export class ClipError extends Error {
  public readonly details: ClipErrorDetails;
  constructor(
    public code: ClipErrorCode,
    message: string,
    details: ClipErrorDetails = {}
  ) {
    super(message);
    this.name = "ClipError";
    this.details = details;
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

const LOGIN_URL_PATTERNS = [
  /\/login(\b|\/|\?|$)/i,
  /\/signin(\b|\/|\?|$)/i,
  /\/sign-in(\b|\/|\?|$)/i,
  /\/sso\//i,
  /\/oauth\//i,
  /\/auth\//i,
  /\/saml\//i,
  /\/account\/login/i,
  /[?&](redirect_to|return_to|next|destination|os_destination)=/i,
];

function looksLikeLoginUrl(url: string): boolean {
  return LOGIN_URL_PATTERNS.some((re) => re.test(url));
}

function looksLikeLoginPage(html: string): boolean {
  // Cheap pre-check before parsing — most real articles don't have these tokens at all.
  const cheap = /<input[^>]+type=["']?password["']?/i.test(html)
    || /name=["']os_username["']/i.test(html)              // Atlassian / Confluence
    || /name=["']j_username["']/i.test(html)               // Spring Security
    || /<form[^>]+action=["'][^"']*\/(login|signin|j_security_check)/i.test(html)
    || /window\.location[^;]+\/login/i.test(html);
  return cheap;
}

export async function extractFromHtml(html: string, url: string): Promise<ExtractResult> {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const bodyLen = (article?.textContent ?? "").trim().length;
  if (!article || !article.content || bodyLen < MIN_BODY_CHARS) {
    if (looksLikeLoginPage(html)) {
      throw new ClipError(
        "AUTH_REQUIRED",
        `Page at ${url} appears to require authentication (login form detected)`,
        { loginUrl: url, signal: "login_page_body" }
      );
    }
    throw new ClipError(
      "EXTRACTION_FAILED",
      `Could not extract enough article content from ${url}`
    );
  }

  const markdown = turndown.turndown(article.content);
  const title = (article.title || dom.window.document.title || "").trim() || "Untitled";

  return { title, markdown };
}

export interface FetchOptions {
  headers?: Record<string, string>;
}

export interface FetchResult {
  html: string;
  finalUrl: string;
}

export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ClipError("INVALID_URL", `Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ClipError("INVALID_URL", `Unsupported protocol: ${parsed.protocol}`);
  }

  const headers: Record<string, string> = {
    "User-Agent": "ctxnest-clipper/1.0 (+https://ctxnest.dev)",
    ...(opts.headers ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers,
    });
  } catch (e) {
    throw new ClipError("FETCH_FAILED", `Network error fetching ${url}: ${(e as Error).message}`);
  }

  const finalUrl = res.url || url;

  if (res.status === 401) {
    throw new ClipError(
      "AUTH_REQUIRED",
      `HTTP 401 Unauthorized fetching ${url}`,
      {
        loginUrl: finalUrl,
        wwwAuthenticate: res.headers.get("www-authenticate") ?? undefined,
        signal: "http_401",
      }
    );
  }
  if (res.status === 403) {
    throw new ClipError(
      "AUTH_REQUIRED",
      `HTTP 403 Forbidden fetching ${url} (likely auth required)`,
      { loginUrl: finalUrl, signal: "http_403" }
    );
  }

  if (!res.ok) {
    throw new ClipError("FETCH_FAILED", `HTTP ${res.status} fetching ${url}`);
  }

  // Redirect-to-login: original wasn't login-shaped, but we landed on a login page.
  if (finalUrl !== url && looksLikeLoginUrl(finalUrl) && !looksLikeLoginUrl(url)) {
    throw new ClipError(
      "AUTH_REQUIRED",
      `Request for ${url} was redirected to login page ${finalUrl}`,
      { loginUrl: finalUrl, signal: "redirect_to_login" }
    );
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
    throw new ClipError("UNSUPPORTED_CONTENT_TYPE", `Expected text/html, got ${contentType || "(none)"} from ${url}`);
  }

  const html = await res.text();
  return { html, finalUrl };
}
