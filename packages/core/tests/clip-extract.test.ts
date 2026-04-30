import { describe, it, expect } from "vitest";
import { extractFromHtml, ClipError } from "../src/clip/extract.js";

const ARTICLE_HTML = `
<!doctype html><html><head><title>Sample Page</title></head>
<body>
  <nav>nav junk</nav>
  <article>
    <h1>Real Heading</h1>
    <p>${"This is the actual article body content. ".repeat(20)}</p>
    <pre><code>const x = 1;</code></pre>
  </article>
  <footer>footer junk</footer>
</body></html>`;

describe("extractFromHtml", () => {
  it("returns title and markdown body for an article-shaped page", () => {
    const r = extractFromHtml(ARTICLE_HTML, "https://example.com/x");
    expect(r.title).toBe("Sample Page");
    expect(r.markdown).toContain("Real Heading");
    expect(r.markdown).toContain("const x = 1");
    expect(r.markdown).not.toContain("nav junk");
    expect(r.markdown).not.toContain("footer junk");
  });

  it("throws EXTRACTION_FAILED when body is too short", () => {
    const html = `<!doctype html><html><body><p>tiny</p></body></html>`;
    expect(() => extractFromHtml(html, "https://example.com/x")).toThrow(ClipError);
    try { extractFromHtml(html, "https://example.com/x"); }
    catch (e) { expect((e as ClipError).code).toBe("EXTRACTION_FAILED"); }
  });
});
