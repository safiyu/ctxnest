#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createDatabase,
  createFile,
  readFile,
  updateFile,
  deleteFile,
  listFiles,
  addTags,
  removeTags,
  setFavorite,
  search,
  registerProject,
  discoverFiles,
  listTags,
  listProjects,
  syncBackup,
  bundleSearch,
  estimateTokensFromBuffer,
  clipUrl,
  ClipError,
  getHistory,
  getDiff,
  getDatabase,
  findRelated,
  whatsNew,
  projectMap,
  getTagsForFiles,
  restoreVersion,
  parseOutline,
  findSection,
  replaceSection,
  listProjectFolders,
  createFolder,
  deleteFolder,
  moveFile,
  withLock,
} from "@ctxnest/core";
import { isAbsolute, join, resolve, sep } from "node:path";
import { statSync, openSync, readSync, closeSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const dataDir = process.env.CTXNEST_DATA_DIR || join(process.cwd(), "data");
const dbPath = process.env.CTXNEST_DB_PATH || join(dataDir, "ctxnest.db");

// Soft cap that surfaces a warning to the agent when a project / map
// exceeds the configured budget. No data is dropped — the response still
// carries the full payload, but the warning gives the agent a chance to
// add ignore patterns or scope the query before piping the result into a
// downstream LLM.
const PROJECT_TOKEN_WARN_THRESHOLD = Number(
  process.env.CTXNEST_PROJECT_TOKEN_WARN ?? 100_000
);
function tokenWarning(total: number): string | null {
  if (!Number.isFinite(PROJECT_TOKEN_WARN_THRESHOLD) || PROJECT_TOKEN_WARN_THRESHOLD <= 0) return null;
  if (total <= PROJECT_TOKEN_WARN_THRESHOLD) return null;
  return (
    `Project content totals ~${total.toLocaleString()} tokens, above the ` +
    `${PROJECT_TOKEN_WARN_THRESHOLD.toLocaleString()}-token soft cap. ` +
    `Consider narrowing scope (folder/tag filters), adding ignore patterns ` +
    `(e.g. node_modules-style build/cache dirs), or using bundle_search with a ` +
    `max_tokens budget instead of pulling the full set into one prompt.`
  );
}

function estimateTokensFromFile(filePath: string, sizeBytes: number): number {
  if (sizeBytes <= 0) return 1;
  const sampleSize = Math.min(4096, sizeBytes);
  if (sampleSize < 256) return Math.max(1, Math.ceil(sizeBytes / 4));
  let mostlyAscii = true;
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const buf = Buffer.alloc(sampleSize);
    readSync(fd, buf, 0, sampleSize, 0);
    mostlyAscii = buf.toString("utf-8").length > sampleSize * 0.7;
  } catch {} finally {
    if (fd !== null) try { closeSync(fd); } catch {}
  }
  return Math.max(1, Math.ceil(sizeBytes / (mostlyAscii ? 4 : 3)));
}

// Adds size_bytes + est_tokens so agents can budget context before pulling content.
function annotateTokens<T extends { path?: string; content?: string }>(rec: T): T & { size_bytes: number | null; est_tokens: number | null } {
  let size_bytes: number | null = null;
  let est_tokens: number | null = null;
  if (typeof rec.content === "string") {
    const buf = Buffer.from(rec.content, "utf-8");
    size_bytes = buf.length;
    est_tokens = estimateTokensFromBuffer(buf);
  } else if (rec.path) {
    try {
      size_bytes = statSync(rec.path).size;
      est_tokens = estimateTokensFromFile(rec.path, size_bytes);
    } catch {}
  }
  return { ...rec, size_bytes, est_tokens };
}

// Bulk-attach tag names so list-style responses don't force an N+1 read_file.
function attachTags<T extends { id: number }>(records: T[]): (T & { tags: string[] })[] {
  if (records.length === 0) return [];
  const tagMap = getTagsForFiles(records.map((r) => r.id));
  return records.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

createDatabase(dbPath);

const server = new McpServer({
  name: "ctxnest",
  version: "5.2.1",
});

server.tool(
  "create_file",
  "Create a new markdown file in the knowledge base or project",
  {
    title: z.string().describe("Title of the file"),
    content: z.string().describe("Content of the file"),
    destination: z.enum(["knowledge", "project", "ctxnest"]).describe("Destination type"),
    project_id: z.number().optional().describe("Project ID (required for project/ctxnest destinations)"),
    folder: z.string().optional().describe("Optional folder path"),
    tags: z.array(z.string()).optional().describe("Optional array of tags"),
  },
  async ({ title, content, destination, project_id, folder, tags }) => {
    const result = await createFile({
      title,
      content,
      destination,
      projectId: project_id,
      folder,
      tags,
      dataDir,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(annotateTokens(result), null, 2) }],
    };
  }
);

server.tool(
  "read_file",
  "Read a file by its ID. Response includes est_tokens (heuristic) so the agent can budget context window usage before pulling the full content.",
  {
    id: z.number().describe("File ID"),
  },
  async ({ id }) => {
    const result = readFile(id);
    return {
      content: [{ type: "text", text: JSON.stringify(annotateTokens(result), null, 2) }],
    };
  }
);

server.tool(
  "read_files",
  "Read multiple files by id in a single call. Symmetric counterpart to `create_files` / `delete_files`. Returns one annotated record per id; per-id failures land in `errors[]` and don't abort the batch.",
  {
    ids: z.array(z.number()).min(1).max(200).describe("File IDs to read (max 200 per call)"),
  },
  async ({ ids }) => {
    const files: any[] = [];
    const errors: { id: number; error: string }[] = [];
    let total_est_tokens = 0;
    for (const id of ids) {
      try {
        const r = annotateTokens(readFile(id));
        files.push(r);
        total_est_tokens += r.est_tokens ?? 0;
      } catch (e: any) {
        errors.push({ id, error: e?.message ?? String(e) });
      }
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ files, total_est_tokens, error_count: errors.length, errors }, null, 2) }],
    };
  }
);

server.tool(
  "describe_file",
  "Return everything ABOUT a file without pulling its content (no token cost from the body). Tags, size, est_tokens, history depth, related-file ids, backlinks, project, folder, last edited. Use this when you'd otherwise chain `read_file` + `list_tags` + `get_history` + `find_related` just to decide whether to actually read the file.",
  {
    id: z.number().describe("File ID"),
  },
  async ({ id }) => {
    try {
      const db = getDatabase();
      const file = db
        .prepare("SELECT * FROM files WHERE id = ?")
        .get(id) as any;
      if (!file) throw new Error(`File not found: ${id}`);

      const tags = (db
        .prepare(
          `SELECT t.name FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.file_id = ? ORDER BY t.name`
        )
        .all(id) as { name: string }[]).map((r) => r.name);

      const favorite = !!db.prepare("SELECT 1 FROM favorites WHERE file_id = ?").get(id);

      let projectName: string | null = null;
      let folder: string | null = null;
      if (file.project_id) {
        const project = db
          .prepare("SELECT name, path FROM projects WHERE id = ?")
          .get(file.project_id) as { name: string; path: string | null } | undefined;
        projectName = project?.name ?? null;
        if (project?.path && file.path?.startsWith(project.path)) {
          const rel = file.path.slice(project.path.length).replace(/^[\/\\]+/, "");
          const parts = rel.split(/[\/\\]/);
          folder = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        }
      } else {
        const knowledgeRoot = join(dataDir, "knowledge");
        if (file.path?.startsWith(knowledgeRoot)) {
          const rel = file.path.slice(knowledgeRoot.length).replace(/^[\/\\]+/, "");
          const parts = rel.split(/[\/\\]/);
          folder = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        }
      }

      let size_bytes: number | null = null;
      let est_tokens: number | null = null;
      try {
        size_bytes = statSync(file.path).size;
        est_tokens = Math.max(1, Math.ceil(size_bytes / 4));
      } catch {}

      let history_count = 0;
      try {
        const hist = await getHistory(repoDirForFile(file), file.path);
        history_count = hist.length;
      } catch {}

      let related: { id: number; shared_tag_count: number }[] = [];
      try {
        related = findRelated(id, 10).map((r) => ({ id: r.id, shared_tag_count: r.shared_tag_count }));
      } catch {}

      // Backlinks — files containing an EXPLICIT link to this file.
      // Two-stage to avoid prose-noise: FTS5 phrase narrows candidates,
      // then a regex check on each candidate's content keeps only true
      // markdown / wiki-link references.
      //
      // FTS phrase `"basename md"` exploits FTS5's punctuation tokenization:
      // `alpha.md` tokenizes to ["alpha","md"], so the phrase matches both
      // `[label](alpha.md)` and bare `alpha.md` mentions while rejecting
      // unrelated prose like "alpha release" or "alphabet".
      const basenameWithExt = file.path.split(/[/\\]/).pop() ?? "";
      const basename = basenameWithExt.replace(/\.md$/, "");
      let backlinks: { id: number; title: string; path: string }[] = [];
      if (basename && basenameWithExt) {
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const linkPatterns = [
          // Markdown link: [text](anything-ending-in/alpha.md), allow query/anchor
          new RegExp(`\\]\\([^)]*${escapeRegex(basenameWithExt)}(?:[#?][^)]*)?\\)`),
          // Wiki link: [[alpha]] or [[alpha|label]]
          new RegExp(`\\[\\[\\s*${escapeRegex(basename)}\\s*(?:\\|[^\\]]+)?\\]\\]`, "i"),
          // Bare mention of the full filename, surrounded by non-word chars
          new RegExp(`(?:^|[^\\w/-])${escapeRegex(basenameWithExt)}(?:[^\\w]|$)`),
        ];
        try {
          // FTS narrows the candidate set; the regex above is the source
          // of truth. Use `"basename md" OR basename` so both markdown
          // links (where "md" is adjacent) AND wiki links (where it isn't)
          // make it past the FTS filter into the regex check.
          const escFts = basename.replace(/"/g, '""');
          const ftsQuery = `"${escFts} md" OR ${escFts}`;
          const candidates = db
            .prepare(
              `SELECT files.id, files.title, files.path
               FROM fts_index
               JOIN files ON files.id = fts_index.rowid
               WHERE fts_index MATCH ? AND files.id != ?
               LIMIT 200`
            )
            .all(ftsQuery, id) as { id: number; title: string; path: string }[];
          for (const c of candidates) {
            try {
              const content = readFileSync(c.path, "utf8");
              if (linkPatterns.some((re) => re.test(content))) {
                backlinks.push(c);
                if (backlinks.length >= 50) break;
              }
            } catch {}
          }
        } catch {}
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: file.id,
                path: file.path,
                title: file.title,
                project_id: file.project_id,
                project_name: projectName,
                folder,
                storage_type: file.storage_type,
                tags,
                favorite,
                size_bytes,
                est_tokens,
                created_at: file.created_at,
                updated_at: file.updated_at,
                history_count,
                related,
                backlinks,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "read_file_lines",
  "Read a line range from a file (1-indexed, inclusive). Useful for honoring stack-trace-style references ('see lines 40-60') without pulling the whole file. Out-of-range bounds clamp to the file's actual length.",
  {
    id: z.number().describe("File ID"),
    from: z.number().int().positive().describe("First line (1-indexed, inclusive)"),
    to: z.number().int().positive().describe("Last line (1-indexed, inclusive)"),
  },
  async ({ id, from, to }) => {
    try {
      if (to < from) throw new Error("`to` must be >= `from`");
      const file = readFile(id);
      const lines = file.content.split("\n");
      const start = Math.max(0, from - 1);
      const end = Math.min(lines.length, to);
      const slice = lines.slice(start, end).join("\n");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id: id,
                path: file.path,
                from: start + 1,
                to: end,
                total_lines: lines.length,
                content: slice,
                size_bytes: Buffer.byteLength(slice, "utf8"),
                est_tokens: estimateTokensFromBuffer(Buffer.from(slice, "utf8")),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "grep_in_file",
  "Exact-string or regex search WITHIN a single file. Returns matched lines with their line numbers — different from FTS5 `search`, which is tokenized and won't catch URLs / code identifiers / hyphenated terms. Use after `read_file_outline` when you know the file but need to locate a specific reference.",
  {
    id: z.number().describe("File ID"),
    pattern: z.string().describe("Pattern to match. Treated as a JavaScript RegExp source."),
    case_insensitive: z.boolean().optional().describe("Add the 'i' flag (default false)"),
    max_matches: z.number().int().positive().max(500).optional().describe("Cap on returned hits (default 100)"),
  },
  async ({ id, pattern, case_insensitive, max_matches }) => {
    try {
      let re: RegExp;
      try {
        re = new RegExp(pattern, case_insensitive ? "i" : "");
      } catch (e: any) {
        throw new Error(`invalid regex: ${e?.message ?? e}`);
      }
      const file = readFile(id);
      const lines = file.content.split("\n");
      const cap = max_matches ?? 100;
      const matches: { line: number; text: string }[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          matches.push({ line: i + 1, text: lines[i] });
          if (matches.length >= cap) break;
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id: id,
                path: file.path,
                pattern,
                match_count: matches.length,
                truncated: matches.length === cap,
                matches,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "regex_search",
  "Regex search ACROSS files. Use when FTS5's tokenized `search` misses what you need — URLs, code identifiers, hyphenated terms, exact substring matches. Slower than `search` (scans content), so always pass `project_id` (number for one project, null for KB-only) and consider `max_files` to bound the scan. Returns per-file hits with line numbers + the matched line.",
  {
    pattern: z.string().describe("JavaScript RegExp source"),
    project_id: z.number().nullable().optional().describe("Scope to one project, null for KB-only, omit for everything"),
    case_insensitive: z.boolean().optional(),
    max_files: z.number().int().positive().max(2000).optional().describe("Cap on files scanned (default 500)"),
    max_matches_per_file: z.number().int().positive().max(100).optional().describe("Per-file hit cap (default 10)"),
  },
  async ({ pattern, project_id, case_insensitive, max_files, max_matches_per_file }) => {
    try {
      let re: RegExp;
      try {
        re = new RegExp(pattern, case_insensitive ? "i" : "");
      } catch (e: any) {
        throw new Error(`invalid regex: ${e?.message ?? e}`);
      }
      const fileCap = max_files ?? 500;
      const perFileCap = max_matches_per_file ?? 10;
      const db = getDatabase();

      // Scope filter mirrors `search`/`stats`.
      let where = "";
      const params: any[] = [];
      if (project_id === null) {
        where = "WHERE project_id IS NULL";
      } else if (typeof project_id === "number") {
        where = "WHERE project_id = ?";
        params.push(project_id);
      }
      const rows = db
        .prepare(`SELECT id, path, title FROM files ${where} LIMIT ?`)
        .all(...params, fileCap) as { id: number; path: string; title: string }[];

      const hits: any[] = [];
      let scanned = 0;
      for (const r of rows) {
        scanned++;
        let content: string;
        try { content = readFileSync(r.path, "utf8"); } catch { continue; }
        const lines = content.split("\n");
        const fileHits: { line: number; text: string }[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            fileHits.push({ line: i + 1, text: lines[i] });
            if (fileHits.length >= perFileCap) break;
          }
        }
        if (fileHits.length > 0) {
          hits.push({ file_id: r.id, path: r.path, title: r.title, match_count: fileHits.length, matches: fileHits });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pattern,
                files_scanned: scanned,
                files_truncated: rows.length === fileCap,
                file_hit_count: hits.length,
                total_match_count: hits.reduce((s, h) => s + h.match_count, 0),
                hits,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "update_file",
  "Update the content of an existing file",
  {
    id: z.number().describe("File ID"),
    content: z.string().describe("New content"),
  },
  async ({ id, content }) => {
    const result = await updateFile(id, content, dataDir);
    return {
      content: [{ type: "text", text: JSON.stringify(annotateTokens(result), null, 2) }],
    };
  }
);

server.tool(
  "delete_file",
  "Delete a file by its ID",
  {
    id: z.number().describe("File ID"),
  },
  async ({ id }) => {
    deleteFile(id, dataDir);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
    };
  }
);

server.tool(
  "list_files",
  "List files with optional filters. Each result is annotated inline with `tags` (string[]), `est_tokens`, and `size_bytes` so you can decide what to read without an N+1 round-trip per file.",
  {
    project_id: z.number().nullable().optional().describe("Filter by project ID. Pass null to list ONLY Knowledge Base files (project_id IS NULL)."),
    tag: z.string().optional().describe("Filter by tag name"),
    favorite: z.boolean().optional().describe("Filter by favorite status"),
    folder: z.string().optional().describe("Filter by folder path"),
    untagged: z.boolean().optional().describe("If true, return only files that have no tags. Useful for bulk-tagging workflows."),
    limit: z.number().optional().describe("Maximum number of results"),
    offset: z.number().optional().describe("Offset for pagination"),
  },
  async ({ project_id, tag, favorite, folder, untagged, limit, offset }) => {
    const filters: any = {};
    // null = KB-only (project_id IS NULL); undefined = no filter; number = exact match
    if (project_id !== undefined) filters.project_id = project_id;
    if (tag !== undefined) filters.tag = tag;
    if (favorite !== undefined) filters.favorite = favorite;
    if (folder !== undefined) filters.folder = folder;
    if (untagged !== undefined) filters.untagged = untagged;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const result = listFiles({ dataDir, filters });
    const annotated = attachTags(result.map(annotateTokens));
    const total_est_tokens = annotated.reduce((s, f) => s + (f.est_tokens ?? 0), 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ files: annotated, total_est_tokens }, null, 2) }],
    };
  }
);

server.tool(
  "search",
  "Search files using full-text search. Each match is annotated inline with `tags` (string[]), `est_tokens`, `size_bytes`, plus a `match_excerpt` (snippet of the content around the matched terms, with hits wrapped in `<<<…>>>` markers) and a `title_highlight` (full title with the same markers). The excerpt removes the need for a follow-up `read_file` to see WHERE the match was. Note: FTS is tokenized — for browsing files by name or navigating the KB structure, prefer `project_map` (faster, no tokenization). Use `regex_search` when you need exact substring or identifier matching.",
  {
    query: z.string().describe("Search query"),
    project_id: z.number().nullable().optional().describe("Filter by project ID. Pass null to search ONLY Knowledge Base files."),
    tags: z.array(z.string()).optional().describe("Filter by tags (all must match)"),
    favorite: z.boolean().optional().describe("Filter by favorite status"),
  },
  async ({ query, project_id, tags, favorite }) => {
    const filters: any = { query };
    if (project_id !== undefined) filters.project_id = project_id;
    if (tags !== undefined) filters.tags = tags;
    if (favorite !== undefined) filters.favorite = favorite;

    const result = search(filters);
    const annotated = attachTags(result.map(annotateTokens));
    const total_est_tokens = annotated.reduce((s, f) => s + (f.est_tokens ?? 0), 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ matches: annotated, total_est_tokens }, null, 2) }],
    };
  }
);

server.tool(
  "bundle_search",
  "Run a full-text search and return the matched files concatenated into a prompt-ready bundle. Use instead of search + multiple read_file calls when you need several related files for context. Output is capped by max_tokens (stops at the first file that would exceed).",
  {
    query: z.string().describe("Full-text search query"),
    project_id: z.number().nullable().optional().describe("Filter by project ID. Pass null to bundle ONLY Knowledge Base files."),
    tags: z.array(z.string()).optional().describe("Filter by tags (all must match)"),
    favorite: z.boolean().optional().describe("Filter by favorite status"),
    format: z.enum(["xml", "markdown"]).default("xml")
      .describe("Bundle format. xml = Anthropic-recommended <document> tags; markdown = ## headers + fenced blocks"),
    max_tokens: z.number().int().positive().default(50000)
      .describe("Token budget. Files added in rank order until the next would exceed; remainder go to skipped[]"),
  },
  async ({ query, project_id, tags, favorite, format, max_tokens }) => {
    const filters: any = { query };
    if (project_id !== undefined) filters.project_id = project_id;
    if (tags !== undefined) filters.tags = tags;
    if (favorite !== undefined) filters.favorite = favorite;

    const result = await bundleSearch(filters, { format, max_tokens });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "add_tags",
  "Add tags to a file",
  {
    file_id: z.number().describe("File ID"),
    tags: z.array(z.string()).describe("Array of tag names to add"),
  },
  async ({ file_id, tags }) => {
    addTags(file_id, tags);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
    };
  }
);

server.tool(
  "remove_tags",
  "Remove tags from a file",
  {
    file_id: z.number().describe("File ID"),
    tag_ids: z.array(z.number()).describe("Array of tag IDs to remove"),
  },
  async ({ file_id, tag_ids }) => {
    removeTags(file_id, tag_ids);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
    };
  }
);

server.tool(
  "set_favorite",
  "Set or unset a file as favorite",
  {
    file_id: z.number().describe("File ID"),
    favorite: z.boolean().describe("Favorite status"),
  },
  async ({ file_id, favorite }) => {
    setFavorite(file_id, favorite);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
    };
  }
);

server.tool(
  "list_tags",
  "List all tags",
  {},
  async () => {
    const result = listTags();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "list_projects",
  "List all projects",
  {},
  async () => {
    const result = listProjects();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "register_project",
  "Register a new project and discover its markdown files. If the user wants to register the project they are currently working in, resolve the current working directory to an absolute path and pass it as the path parameter.",
  {
    name: z.string().describe("Project name"),
    path: z.string().optional().describe("Absolute path to the project root. If not provided by the user, use the current working directory."),
    description: z.string().optional().describe("Optional project description"),
  },
  async ({ name, path, description }) => {
    if (!path) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: "Project path is required. Please provide the absolute path to the project." }, null, 2) }],
      };
    }
    try {
      const project = registerProject(name, path, description);
      // discoverFiles now throws when the project root is unreadable. Catch
      // so registration still succeeds with a soft warning — mirrors the
      // web POST /api/projects route.
      let discoveredFiles: any[] = [];
      let scanWarning: string | null = null;
      try {
        discoveredFiles = discoverFiles(project.id, dataDir);
      } catch (e: any) {
        scanWarning = `Initial scan failed: ${e?.message ?? e}`;
        console.warn(`registerProject succeeded but discoverFiles failed:`, e);
      }
      const annotated = discoveredFiles.map(annotateTokens);
      const total_est_tokens = annotated.reduce((s, f) => s + (f.est_tokens ?? 0), 0);
      const sizeWarning = tokenWarning(total_est_tokens);
      const warnings = [scanWarning, sizeWarning].filter((w): w is string => !!w);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                project,
                discovered_files_count: annotated.length,
                total_est_tokens,
                discovered_files: annotated,
                ...(warnings.length ? { warnings } : {}),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e.message }, null, 2) }],
      };
    }
  }
);

server.tool(
  "commit_backup",
  "Commit recent file changes to the project's git backup. Run after a batch of create_file/update_file/delete_file operations to persist them to the backup directory and push to the remote backup. Note that the backup is in a ",
  {
    project_id: z.number().describe("Project ID"),
  },
  async ({ project_id }) => {
    const copiedPaths = await syncBackup(project_id, dataDir);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              copied_files_count: copiedPaths.length,
              copied_paths: copiedPaths,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "clip_url",
  "Clip a web page into the knowledge base as cleaned Markdown. Fetches the URL, extracts the main article content (Readability), converts to Markdown, and stores it under knowledge/urlclips/. Re-clipping the same URL updates the existing file in place. If the page requires authentication (HTTP 401/403, redirect-to-login, or login-form body), returns code AUTH_REQUIRED with auth_required:true and a login_url; pass cookies/tokens via the optional headers param to retry.",
  {
    url: z.string().url().describe("The URL to clip"),
    title: z.string().optional().describe("Optional title override (defaults to the page's <title>)"),
    headers: z
      .record(z.string())
      .optional()
      .describe("Optional HTTP headers to forward with the fetch (e.g. {\"Cookie\": \"session=...\"} or {\"Authorization\": \"Bearer ...\"}). Use to clip pages behind auth walls after AUTH_REQUIRED."),
  },
  async ({ url, title, headers }) => {
    try {
      const file = await clipUrl({ url, title, dataDir, headers });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id: file.id,
                path: file.path,
                title: file.title,
                source: file.source_path,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e) {
      const code = e instanceof ClipError ? e.code : "INTERNAL_ERROR";
      const message = (e as Error).message ?? String(e);
      const payload: Record<string, unknown> = { code, message };
      if (e instanceof ClipError && code === "AUTH_REQUIRED") {
        payload.auth_required = true;
        if (e.details.loginUrl) payload.login_url = e.details.loginUrl;
        if (e.details.signal) payload.signal = e.details.signal;
        if (e.details.wwwAuthenticate) payload.www_authenticate = e.details.wwwAuthenticate;
        payload.hint = "Page requires authentication. Retry with the optional `headers` param (e.g. {\"Cookie\": \"...\"} or {\"Authorization\": \"Bearer ...\"}).";
      }
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  }
);

// Resolves the git repo dir for a file: reference files live in the project's
// own repo, everything else lives in the global data dir.
function repoDirForFile(file: { storage_type: string; project_id: number | null }): string {
  if (file.storage_type === "reference" && file.project_id) {
    const project = getDatabase()
      .prepare("SELECT path FROM projects WHERE id = ?")
      .get(file.project_id) as { path: string | null } | undefined;
    if (project?.path) return project.path;
  }
  return dataDir;
}

server.tool(
  "get_history",
  "List the commit history for a context file. Returns each commit as { hash, message, date, author }, newest first. Useful for explaining how a piece of context evolved over time.",
  {
    file_id: z.number().describe("ID of the file"),
  },
  async ({ file_id }) => {
    const file = readFile(file_id);
    const history = await getHistory(repoDirForFile(file), file.path);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ file_id, path: file.path, history }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_diff",
  "Get the unified diff of a context file between two commits. Use the hashes returned by get_history. Lets agents see what actually changed, not just that something changed.",
  {
    file_id: z.number().describe("ID of the file"),
    commit_a: z.string().describe("Earlier commit hash (from get_history)"),
    commit_b: z.string().describe("Later commit hash (from get_history)"),
  },
  async ({ file_id, commit_a, commit_b }) => {
    const file = readFile(file_id);
    const diff = await getDiff(repoDirForFile(file), file.path, commit_a, commit_b);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ file_id, path: file.path, commit_a, commit_b, diff }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "restore_file",
  "Restore a context file to a specific commit version. Use the hashes returned by get_history. This is useful for undoing accidental changes or recovering previous content.",
  {
    file_id: z.number().describe("ID of the file"),
    hash: z.string().describe("Commit hash to restore from (from get_history)"),
  },
  async ({ file_id, hash }) => {
    try {
      const file = readFile(file_id);
      const content = await restoreVersion(repoDirForFile(file), file.path, hash);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id,
                path: file.path,
                hash,
                success: true,
                message: `File restored to version ${hash.slice(0, 7)}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e.message }, null, 2) }],
      };
    }
  }
);

// --- Section-level read/write ----------------------------------------------
// These let an agent inspect a file's heading structure, pull just one
// section's content, and surgically replace a section without round-tripping
// the whole document. Big context-budget win for large notes.

server.tool(
  "read_file_outline",
  "Return the heading outline of a file as a flat list (level 1-6, text, line, byte offsets). Use this before `read_section` / `update_file_section` so you know what headings exist without pulling the whole file into context.",
  {
    file_id: z.number().describe("File ID"),
  },
  async ({ file_id }) => {
    try {
      const file = readFile(file_id);
      const outline = parseOutline(file.content).map((n) => ({
        level: n.level,
        text: n.text,
        line: n.line,
        byteStart: n.byteStart,
        byteEnd: n.byteEnd,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { file_id, path: file.path, title: file.title, outline },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "read_section",
  "Return just the body of one heading from a file (heading line itself excluded). Heading match is case-insensitive on trimmed text; if multiple headings share a name, the shallowest match wins. Pair with `read_file_outline` if you're not sure which headings exist.",
  {
    file_id: z.number().describe("File ID"),
    heading: z.string().describe("Heading text to extract (case-insensitive)"),
  },
  async ({ file_id, heading }) => {
    try {
      const file = readFile(file_id);
      const node = findSection(file.content, heading);
      if (!node) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: `Section not found: ${heading}` }, null, 2) }],
        };
      }
      const buf = Buffer.from(file.content, "utf8");
      const body = buf.subarray(node.contentStart, node.contentEnd).toString("utf8");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id,
                path: file.path,
                heading: node.text,
                level: node.level,
                line: node.line,
                content: body,
                size_bytes: Buffer.byteLength(body, "utf8"),
                est_tokens: estimateTokensFromBuffer(Buffer.from(body, "utf8")),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "update_file_section",
  "Replace the body of one heading without touching siblings. Heading line itself is preserved. Persists via the same path as `update_file` — same FTS reindex + git commit semantics. Throws if the heading doesn't exist (use `read_file_outline` first).",
  {
    file_id: z.number().describe("File ID"),
    heading: z.string().describe("Heading whose body to replace (case-insensitive)"),
    content: z.string().describe("New body content (heading line is preserved automatically)"),
  },
  async ({ file_id, heading, content }) => {
    try {
      const file = readFile(file_id);
      const updated = replaceSection(file.content, heading, content);
      const result = await updateFile(file_id, updated, dataDir);
      return {
        content: [{ type: "text", text: JSON.stringify(annotateTokens(result), null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

// --- Folder ops ------------------------------------------------------------
// Resolve the base directory for folder operations: a registered project's
// path, or `<dataDir>/knowledge` for KB-scoped operations.
function resolveFolderBase(projectId: number | null | undefined): string {
  if (projectId === undefined || projectId === null) {
    return join(dataDir, "knowledge");
  }
  const project = getDatabase()
    .prepare("SELECT path FROM projects WHERE id = ?")
    .get(projectId) as { path: string | null } | undefined;
  if (!project?.path) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project.path;
}

function validateFolderName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("name must be a non-empty string");
  }
  if (name.includes("\0")) throw new Error("name contains null byte");
  if (name.startsWith("/") || name.startsWith("\\")) {
    throw new Error("name must not start with a path separator");
  }
  if (name.split(/[/\\]/).some((seg) => seg === "..")) {
    throw new Error("name must not contain '..' segments");
  }
}

server.tool(
  "list_folders",
  "List folders under a project (or the Knowledge Base when project_id is null/omitted). Returns relative folder paths plus the absolute base path so you can construct child paths.",
  {
    project_id: z.number().nullable().optional().describe("Project ID. Pass null or omit to list KB folders."),
  },
  async ({ project_id }) => {
    try {
      const base = resolveFolderBase(project_id);
      const folders = listProjectFolders(base);
      return {
        content: [{ type: "text", text: JSON.stringify({ folders, base_path: base }, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "create_folder",
  "Create a folder under a project (or the Knowledge Base when project_id is null/omitted). Nested paths like `notes/inbox` are allowed; '..' segments and absolute paths are rejected.",
  {
    project_id: z.number().nullable().optional().describe("Project ID. Pass null or omit to create the folder under the KB."),
    name: z.string().describe("Folder name (relative; supports nested paths via '/')"),
  },
  async ({ project_id, name }) => {
    try {
      validateFolderName(name);
      const base = resolveFolderBase(project_id);
      const path = createFolder(base, name);
      return {
        content: [{ type: "text", text: JSON.stringify({ path, base_path: base }, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "delete_folder",
  "Delete a Knowledge Base folder (recursive). Refuses to delete folders inside a registered project — the file watcher would re-ingest the contents seconds later, making the deletion silently revert. Remove project files via your editor / disk instead.",
  {
    project_id: z.number().nullable().optional().describe("Project ID. Pass null or omit to delete from the KB. Project IDs are rejected."),
    name: z.string().describe("Folder name (relative)"),
  },
  async ({ project_id, name }) => {
    try {
      validateFolderName(name);
      if (project_id !== undefined && project_id !== null) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error:
                    "Cannot delete folders inside a registered project. The watcher would re-ingest the contents. Unregister the project or remove the folder from disk in your editor instead.",
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const base = resolveFolderBase(null);
      deleteFolder(base, name);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "move_file",
  "Move/rename a file. `new_path` must be absolute and resolve INSIDE the file's owning project (for reference files) or `<dataDir>/knowledge` (for KB files). Cross-project / cross-section moves are rejected. Updates the DB row's path so existing tags/favorites/history survive.",
  {
    file_id: z.number().describe("File ID"),
    new_path: z.string().describe("Absolute destination path"),
  },
  async ({ file_id, new_path }) => {
    try {
      if (typeof new_path !== "string" || new_path.length === 0) {
        throw new Error("new_path is required");
      }
      if (new_path.includes("\0")) throw new Error("new_path contains null byte");
      if (!isAbsolute(new_path)) throw new Error("new_path must be absolute");

      const file = readFile(file_id);
      // Same base-resolution rule as repoDirForFile, but applied to the
      // destination instead of the file's current location: reference files
      // stay inside their project, KB files stay inside <dataDir>/knowledge.
      let base: string;
      if (file.storage_type === "reference" && file.project_id) {
        const project = getDatabase()
          .prepare("SELECT path FROM projects WHERE id = ?")
          .get(file.project_id) as { path: string | null } | undefined;
        if (!project?.path) throw new Error(`Project not found for file ${file_id}`);
        base = project.path;
      } else {
        base = join(dataDir, "knowledge");
      }
      const baseResolved = resolve(base);
      const destResolved = resolve(new_path);
      if (destResolved !== baseResolved && !destResolved.startsWith(baseResolved + sep)) {
        throw new Error(`new_path must be inside ${base}`);
      }

      const updated = moveFile(file_id, new_path);
      return {
        content: [{ type: "text", text: JSON.stringify(annotateTokens(updated as any), null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "find_related",
  "Find other context files related to the given file by overlap of tags. Returns files ranked by shared tag count (highest first), each annotated with which tags they share. Surfaces logically related context that might not match the same search keywords.",
  {
    file_id: z.number().describe("ID of the file to find relations for"),
    limit: z.number().optional().describe("Maximum number of related files to return (default 10)"),
  },
  async ({ file_id, limit }) => {
    const related = findRelated(file_id, limit ?? 10);
    const annotated = related.map((r) => ({ ...annotateTokens(r), shared_tag_count: r.shared_tag_count, shared_tags: r.shared_tags }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ file_id, related: annotated }, null, 2),
        },
      ],
    };
  }
);

// --- Batch ops + lookups + stats -------------------------------------------

server.tool(
  "create_files",
  "Create multiple files in a single call. Each item carries the same fields as `create_file`. Failures on individual items are reported in `errors[]` and don't abort the rest of the batch.",
  {
    files: z
      .array(
        z.object({
          title: z.string(),
          content: z.string(),
          destination: z.enum(["knowledge", "project", "ctxnest"]),
          project_id: z.number().optional(),
          folder: z.string().optional(),
          tags: z.array(z.string()).optional(),
        })
      )
      .min(1)
      .max(200)
      .describe("Files to create (max 200 per call)"),
  },
  async ({ files }) => {
    const created: any[] = [];
    const errors: { index: number; title: string; error: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const result = await createFile({
          title: f.title,
          content: f.content,
          destination: f.destination,
          projectId: f.project_id,
          folder: f.folder,
          tags: f.tags,
          dataDir,
        });
        created.push(annotateTokens(result));
      } catch (e: any) {
        errors.push({ index: i, title: f.title, error: e?.message ?? String(e) });
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { created_count: created.length, error_count: errors.length, created, errors },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "delete_files",
  "Delete multiple files by id in a single call. Per-item failures land in `errors[]` and don't abort the rest of the batch. Same physical-deletion rules as `delete_file` (KB files are unlinked from disk; project-reference files are only un-indexed).",
  {
    ids: z.array(z.number()).min(1).max(500).describe("File IDs to delete (max 500 per call)"),
  },
  async ({ ids }) => {
    const deleted: number[] = [];
    const errors: { id: number; error: string }[] = [];
    for (const id of ids) {
      try {
        deleteFile(id, dataDir);
        deleted.push(id);
      } catch (e: any) {
        errors.push({ id, error: e?.message ?? String(e) });
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { deleted_count: deleted.length, error_count: errors.length, deleted, errors },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "tag_search_results",
  "Apply tags to every file matching a search query in one call. Use after `search` confirms the query returns the right set. Same filter shape as `search` (`query`, `project_id`, `tags`, `favorite`). Returns the affected file ids and a count.",
  {
    query: z.string().describe("Full-text search query"),
    add_tags: z.array(z.string()).min(1).describe("Tags to add to every matching file"),
    project_id: z.number().nullable().optional(),
    tags: z.array(z.string()).optional().describe("Filter — only matches that already carry ALL of these tags"),
    favorite: z.boolean().optional(),
  },
  async ({ query, add_tags, project_id, tags, favorite }) => {
    const filters: any = { query };
    if (project_id !== undefined) filters.project_id = project_id;
    if (tags !== undefined) filters.tags = tags;
    if (favorite !== undefined) filters.favorite = favorite;
    const matches = search(filters);
    const tagged: number[] = [];
    const errors: { id: number; error: string }[] = [];
    for (const m of matches) {
      try {
        addTags(m.id, add_tags);
        tagged.push(m.id);
      } catch (e: any) {
        errors.push({ id: m.id, error: e?.message ?? String(e) });
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              matched_count: matches.length,
              tagged_count: tagged.length,
              tags_applied: add_tags,
              tagged_ids: tagged,
              errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "read_file_by_path",
  "Look up a file by its absolute path on disk and return the same shape as `read_file`. Useful when an agent has a path from its working directory but no file id (avoids a `list_files` + client-side grep round-trip).",
  {
    path: z.string().describe("Absolute path on disk (must match the path stored in CtxNest)"),
  },
  async ({ path }) => {
    try {
      if (typeof path !== "string" || path.length === 0) {
        throw new Error("path is required");
      }
      const row = getDatabase()
        .prepare("SELECT id FROM files WHERE path = ?")
        .get(path) as { id: number } | undefined;
      if (!row) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `No file indexed at path: ${path}` }, null, 2),
            },
          ],
        };
      }
      const result = readFile(row.id);
      return {
        content: [{ type: "text", text: JSON.stringify(annotateTokens(result), null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "stats",
  "Return aggregate counts for the knowledge base (or one project): file count, untagged count, top tags, project breakdown. Optionally include total estimated tokens (default off — requires statting every file on disk, slower for large vaults).",
  {
    project_id: z.number().nullable().optional().describe("Filter to a single project. Pass null for KB-only. Omit for everything."),
    top_tags: z.number().int().positive().max(100).optional().describe("How many top tags to return (default 10)"),
    include_token_total: z.boolean().optional().describe("If true, stat every matching file on disk to compute total est_tokens. Default false (cheap)."),
  },
  async ({ project_id, top_tags, include_token_total }) => {
    try {
      const db = getDatabase();
      const limit = top_tags ?? 10;

      let scopeWhere = "";
      const scopeParams: any[] = [];
      if (project_id === null) {
        scopeWhere = "WHERE files.project_id IS NULL";
      } else if (typeof project_id === "number") {
        scopeWhere = "WHERE files.project_id = ?";
        scopeParams.push(project_id);
      }

      const fileCount = (db
        .prepare(`SELECT COUNT(*) AS n FROM files ${scopeWhere}`)
        .get(...scopeParams) as { n: number }).n;

      const untaggedCount = (db
        .prepare(
          `SELECT COUNT(*) AS n FROM files ${scopeWhere}${scopeWhere ? " AND" : "WHERE"} files.id NOT IN (SELECT DISTINCT file_id FROM file_tags)`
        )
        .get(...scopeParams) as { n: number }).n;

      const favoriteCount = (db
        .prepare(
          `SELECT COUNT(*) AS n FROM files ${scopeWhere}${scopeWhere ? " AND" : "WHERE"} files.id IN (SELECT file_id FROM favorites)`
        )
        .get(...scopeParams) as { n: number }).n;

      const topTags = db
        .prepare(
          `SELECT t.name, COUNT(*) AS count
           FROM file_tags ft
           JOIN tags t ON t.id = ft.tag_id
           JOIN files ON files.id = ft.file_id
           ${scopeWhere}
           GROUP BY t.id
           ORDER BY count DESC, t.name ASC
           LIMIT ?`
        )
        .all(...scopeParams, limit) as { name: string; count: number }[];

      const byProject =
        project_id === undefined
          ? (db
              .prepare(
                `SELECT p.id, p.name, COUNT(files.id) AS files
                 FROM projects p
                 LEFT JOIN files ON files.project_id = p.id
                 GROUP BY p.id
                 ORDER BY files DESC, p.name ASC`
              )
              .all() as { id: number; name: string; files: number }[])
          : null;

      let totalEstTokens: number | null = null;
      if (include_token_total) {
        const rows = db
          .prepare(`SELECT path FROM files ${scopeWhere}`)
          .all(...scopeParams) as { path: string }[];
        let total = 0;
        for (const r of rows) {
          try {
            const sz = statSync(r.path).size;
            total += Math.max(1, Math.ceil(sz / 4));
          } catch {}
        }
        totalEstTokens = total;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                scope:
                  project_id === undefined
                    ? "all"
                    : project_id === null
                      ? "knowledge_base"
                      : `project:${project_id}`,
                file_count: fileCount,
                untagged_count: untaggedCount,
                favorite_count: favoriteCount,
                top_tags: topTags,
                ...(byProject ? { by_project: byProject } : {}),
                ...(totalEstTokens !== null ? { total_est_tokens: totalEstTokens } : {}),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

// --- Quality of life -------------------------------------------------------

server.tool(
  "suggest_tags",
  "Propose tags for a file based on the existing tag corpus. Strategy: full-text search using the file's title + content, look at the top matching files' tags, return the most common ones not already on this file. No LLM needed; just leverages how YOUR knowledge base is already labelled.",
  {
    file_id: z.number().describe("File ID to suggest tags for"),
    limit: z.number().int().positive().max(50).optional().describe("Max suggestions to return (default 10)"),
  },
  async ({ file_id, limit }) => {
    try {
      const k = limit ?? 10;
      const file = readFile(file_id);
      const db = getDatabase();

      // Tags already on this file — exclude from suggestions.
      const existing = new Set(
        (db
          .prepare(
            `SELECT t.name FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.file_id = ?`
          )
          .all(file_id) as { name: string }[]).map((r) => r.name)
      );

      // Build an FTS5 query from the file's distinctive terms. Strip
      // markdown punctuation, dedupe, drop very short tokens, cap to keep
      // the query under FTS5's parser limits.
      const STOPWORDS = new Set([
        "the","and","for","with","from","this","that","have","into","your",
        "more","than","then","when","what","which","there","these","those",
        "where","while","also","been","were","would","should","could","about",
      ]);
      const tokens = (file.title + " " + file.content)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
      const seen = new Set<string>();
      const distinctive: string[] = [];
      for (const t of tokens) {
        if (!seen.has(t)) {
          seen.add(t);
          distinctive.push(t);
          if (distinctive.length >= 40) break;
        }
      }
      if (distinctive.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ suggestions: [], reason: "no distinctive terms in file" }, null, 2) }],
        };
      }
      const ftsQuery = distinctive.map((t) => `"${t}"`).join(" OR ");

      // For each tagged file matching the query, weight its tags by FTS rank
      // (lower rank = better match in FTS5; flip sign so higher = better).
      const rows = db
        .prepare(
          `SELECT t.name, fts_index.rank
           FROM fts_index
           JOIN file_tags ft ON ft.file_id = fts_index.rowid
           JOIN tags t ON t.id = ft.tag_id
           WHERE fts_index MATCH ?
             AND ft.file_id != ?
           LIMIT 500`
        )
        .all(ftsQuery, file_id) as { name: string; rank: number }[];

      const scores = new Map<string, { score: number; sources: number }>();
      for (const r of rows) {
        if (existing.has(r.name)) continue;
        // FTS5 rank is negative; the more-negative the better. -rank gives
        // a positive weight. Sum across all matching files.
        const w = -r.rank;
        const cur = scores.get(r.name);
        if (cur) {
          cur.score += w;
          cur.sources += 1;
        } else {
          scores.set(r.name, { score: w, sources: 1 });
        }
      }
      const suggestions = [...scores.entries()]
        .map(([name, { score, sources }]) => ({ tag: name, score: Number(score.toFixed(2)), sources }))
        .sort((a, b) => b.score - a.score || b.sources - a.sources || a.tag.localeCompare(b.tag))
        .slice(0, k);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { file_id, path: file.path, existing_tags: [...existing], suggestions },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "diff_against_disk",
  "Compare what's on disk vs what's in the FTS index for a file. Surfaces drift after external edits, sync merges, or restore operations the watcher hasn't picked up yet. Returns whether content matches, sizes, and the first divergent line with a small sample (no full diff payload — agents that need it can read both sides themselves).",
  {
    file_id: z.number().describe("File ID"),
  },
  async ({ file_id }) => {
    try {
      const db = getDatabase();
      const row = db
        .prepare("SELECT path FROM files WHERE id = ?")
        .get(file_id) as { path: string } | undefined;
      if (!row) throw new Error(`File not found: ${file_id}`);

      let diskContent: string | null = null;
      let diskError: string | null = null;
      try {
        // statSync first to surface ENOENT distinctly from a permission error
        statSync(row.path);
        diskContent = readFileSync(row.path, "utf8");
      } catch (e: any) {
        diskError = e?.message ?? String(e);
      }

      const ftsRow = db
        .prepare("SELECT content FROM fts_index WHERE rowid = ?")
        .get(file_id) as { content: string } | undefined;
      const indexContent = ftsRow?.content ?? null;

      if (diskContent === null) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  file_id,
                  path: row.path,
                  status: "disk_unreadable",
                  disk_error: diskError,
                  index_size: indexContent ? Buffer.byteLength(indexContent, "utf8") : null,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      if (indexContent === null) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  file_id,
                  path: row.path,
                  status: "no_index_row",
                  disk_size: Buffer.byteLength(diskContent, "utf8"),
                  hint: "FTS index missing for this file. Touch it and let the watcher reingest, or run an explicit refresh.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (diskContent === indexContent) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  file_id,
                  path: row.path,
                  status: "in_sync",
                  size_bytes: Buffer.byteLength(diskContent, "utf8"),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const diskLines = diskContent.split("\n");
      const idxLines = indexContent.split("\n");
      let firstDiffLine = -1;
      const maxLines = Math.max(diskLines.length, idxLines.length);
      for (let i = 0; i < maxLines; i++) {
        if (diskLines[i] !== idxLines[i]) {
          firstDiffLine = i + 1;
          break;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id,
                path: row.path,
                status: "diverged",
                disk_size: Buffer.byteLength(diskContent, "utf8"),
                index_size: Buffer.byteLength(indexContent, "utf8"),
                disk_line_count: diskLines.length,
                index_line_count: idxLines.length,
                first_diff_line: firstDiffLine,
                disk_sample: firstDiffLine > 0 ? (diskLines[firstDiffLine - 1] ?? null) : null,
                index_sample: firstDiffLine > 0 ? (idxLines[firstDiffLine - 1] ?? null) : null,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "refresh_index",
  "Re-scan disk and reconcile the FTS index. The MCP server has no file watcher (that's the web app's job), so when an editor or sync writes a file behind CtxNest's back, the index goes stale. This tool re-walks the project root (or `<dataDir>/knowledge` when project_id is null/omitted), reindexes any files whose hash drifted, picks up new files, and prunes DB rows for files removed from disk. Pair with `diff_against_disk` to spot what needs refreshing.",
  {
    project_id: z.number().nullable().optional().describe("Project ID. Pass null or omit to reindex the Knowledge Base."),
  },
  async ({ project_id }) => {
    try {
      const db = getDatabase();

      if (typeof project_id === "number") {
        // Project scope: delegate to the same path register/refresh uses.
        const project = db
          .prepare("SELECT id, path FROM projects WHERE id = ?")
          .get(project_id) as { id: number; path: string | null } | undefined;
        if (!project?.path) {
          throw new Error(`Project not found or has no path: ${project_id}`);
        }
        const discovered = discoverFiles(project.id, dataDir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { scope: `project:${project_id}`, newly_indexed: discovered.length, refreshed_files: discovered.length },
                null,
                2
              ),
            },
          ],
        };
      }

      // KB scope — discoverFiles is project-only, so walk knowledge/ ourselves.
      const root = join(dataDir, "knowledge");
      if (!existsSync(root)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ scope: "knowledge_base", newly_indexed: 0, refreshed: 0, pruned: 0, note: "knowledge/ does not exist" }, null, 2) }],
        };
      }

      const MAX_FILE_BYTES = 5 * 1024 * 1024;
      const SKIP_DIRS = new Set([
        "node_modules", ".git",
        ".next", ".nuxt", ".cache", ".venv", ".tox", ".gradle", ".idea",
        "dist", "build", "out", "target",
      ]);
      const onDisk = new Set<string>();

      function walk(dir: string): void {
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const e of entries) {
          const p = join(dir, e);
          let st;
          try { st = statSync(p); } catch { continue; }
          if (st.isDirectory()) {
            if (SKIP_DIRS.has(e)) continue;
            walk(p);
          } else if (st.isFile() && p.endsWith(".md") && st.size <= MAX_FILE_BYTES) {
            onDisk.add(p);
          }
        }
      }
      walk(root);

      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO files (path, title, project_id, storage_type, content_hash) VALUES (?, ?, NULL, 'local', ?)"
      );
      const updateStmt = db.prepare(
        "UPDATE files SET content_hash = ?, updated_at = datetime('now') WHERE id = ?"
      );
      const ftsDelete = db.prepare("DELETE FROM fts_index WHERE rowid = ?");
      const ftsInsert = db.prepare("INSERT INTO fts_index (rowid, title, content) VALUES (?, ?, ?)");
      const fileDelete = db.prepare("DELETE FROM files WHERE id = ?");

      let newlyIndexed = 0;
      let refreshed = 0;

      for (const path of onDisk) {
        let content: string;
        try { content = readFileSync(path, "utf8"); } catch { continue; }
        const hash = createHash("sha256").update(content).digest("hex");
        const title = path.split(/[/\\]/).pop()!.replace(/\.md$/, "");
        const existing = db
          .prepare("SELECT id, content_hash FROM files WHERE path = ?")
          .get(path) as { id: number; content_hash: string } | undefined;
        if (!existing) {
          db.transaction(() => {
            const r = insertStmt.run(path, title, hash);
            if (r.changes > 0) {
              ftsInsert.run(r.lastInsertRowid, title, content);
              newlyIndexed++;
            }
          })();
        } else if (existing.content_hash !== hash) {
          db.transaction(() => {
            updateStmt.run(hash, existing.id);
            ftsDelete.run(existing.id);
            ftsInsert.run(existing.id, title, content);
          })();
          refreshed++;
        }
      }

      // Prune DB rows for KB files that disappeared from disk.
      const dbRows = db
        .prepare("SELECT id, path FROM files WHERE project_id IS NULL")
        .all() as { id: number; path: string }[];
      let pruned = 0;
      for (const r of dbRows) {
        if (!onDisk.has(r.path)) {
          db.transaction(() => {
            ftsDelete.run(r.id);
            fileDelete.run(r.id);
          })();
          pruned++;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { scope: "knowledge_base", newly_indexed: newlyIndexed, refreshed, pruned },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "journal_append",
  "Low-friction 'save this thought' — appends a timestamped entry to a date-stamped journal file under `<dataDir>/knowledge/journal/YYYY-MM-DD.md`. Creates the file on first use. Each entry becomes its own `## HH:MM:SS` section so it pairs naturally with `read_file_outline` / `read_section`.",
  {
    text: z.string().min(1).describe("Entry text (markdown allowed)"),
    date: z.string().optional().describe("Override the journal date as YYYY-MM-DD (default: today, local time)"),
    tags: z.array(z.string()).optional().describe("Tags to apply to the journal file (default: ['journal'])"),
  },
  async ({ text, date, tags }) => {
    try {
      const today = (() => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      })();
      const dateStr = date ?? today;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error(`date must be YYYY-MM-DD, got: ${dateStr}`);
      }

      const journalPath = join(dataDir, "knowledge", "journal", `${dateStr}.md`);
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const timeStr = `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
      const entry = `\n\n## ${timeStr}\n\n${text.trimEnd()}\n`;

      // Serialize per journal-file so concurrent appends can't lose entries.
      const result = await withLock(`journal:${journalPath}`, async () => {
        const existing = getDatabase()
          .prepare("SELECT id FROM files WHERE path = ?")
          .get(journalPath) as { id: number } | undefined;
        if (existing) {
          const current = readFile(existing.id);
          const updated = await updateFile(existing.id, current.content + entry, dataDir);
          // updateFile preserves tags; only add new ones the file doesn't have.
          if (tags && tags.length > 0) addTags(existing.id, tags);
          return updated;
        }
        const initial = `# Journal — ${dateStr}${entry}`;
        return await createFile({
          title: dateStr,
          content: initial,
          destination: "knowledge",
          folder: "journal",
          tags: tags ?? ["journal"],
          dataDir,
        });
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                file_id: result.id,
                path: result.path,
                date: dateStr,
                time: timeStr,
                appended_chars: entry.length,
                est_tokens: estimateTokensFromBuffer(Buffer.from(result.content, "utf8")),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: e?.message ?? String(e) }, null, 2) }],
      };
    }
  }
);

server.tool(
  "whats_new",
  "List files created or modified since a checkpoint. Use at the start of a fresh session to catch up on changes without re-reading the whole knowledge base. `since` accepts an ISO 8601 timestamp (\"2026-04-30T12:00:00Z\") or a relative duration (\"30m\", \"2h\", \"1d\", \"7d\", \"1w\"). Each file is annotated with `change` (\"created\" or \"modified\"), tags, and est_tokens so you can budget context before fetching content. Note: hard-deleted files are not tracked, so this only surfaces creates and updates.",
  {
    since: z.string().describe("ISO 8601 timestamp or relative duration (e.g. \"1h\", \"7d\", \"2w\")."),
    project_id: z.number().nullable().optional().describe("Filter to a single project. Pass null for knowledge-base-only files. Omit for all."),
    include_tags: z.boolean().optional().describe("Attach tags[] to each file. Default true."),
    limit: z.number().optional().describe("Max files returned. Default 200."),
  },
  async ({ since, project_id, include_tags, limit }) => {
    try {
      const opts: any = { since };
      if (project_id !== undefined) opts.project_id = project_id;
      if (include_tags !== undefined) opts.include_tags = include_tags;
      if (limit !== undefined) opts.limit = limit;
      const result = whatsNew(opts);
      const annotated = result.files.map(annotateTokens);
      const total_est_tokens = annotated.reduce((s, f) => s + (f.est_tokens ?? 0), 0);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                since: result.since,
                until: result.until,
                count: result.count,
                total_est_tokens,
                files: annotated,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: (e as Error).message }, null, 2) }],
      };
    }
  }
);

server.tool(
  "project_map",
  "Return a compact, indented outline of the entire knowledge base — folders, file titles, tags, and file IDs — in a single call. Use at the start of a session instead of repeatedly calling list_files. The outline is a text string (~5x denser than equivalent list_files JSON) where each file appears as `[id] Title  #tag1 #tag2`. Folders sort first, files second; both alphabetic. Returns est_tokens so you can budget context before reading.",
  {
    project_id: z.number().nullable().optional().describe("Restrict to a single project. Pass null for knowledge-base-only files. Omit for everything."),
    include_tags: z.boolean().optional().describe("Append #tags inline. Default true. Set false to shrink the outline."),
    show_titles: z.boolean().optional().describe("Show file titles instead of filenames. Default true."),
    max_lines: z.number().optional().describe("Hard cap on output lines (each line ≈ one folder or file). Default 5000."),
  },
  async ({ project_id, include_tags, show_titles, max_lines }) => {
    const opts: any = { dataDir };
    if (project_id !== undefined) opts.project_id = project_id;
    if (include_tags !== undefined) opts.include_tags = include_tags;
    if (show_titles !== undefined) opts.show_titles = show_titles;
    if (max_lines !== undefined) opts.max_lines = max_lines;
    const result = projectMap(opts);
    const warning = tokenWarning(result.est_tokens);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              stats: result.stats,
              est_tokens: result.est_tokens,
              outline: result.outline,
              ...(warning ? { warning } : {}),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.resource(
  "All Projects",
  "ctxnest://projects",
  {
    description: "List of all registered projects",
    mimeType: "application/json",
  },
  async () => {
    const projects = listProjects();
    return {
      contents: [
        {
          uri: "ctxnest://projects",
          mimeType: "application/json",
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }
);

server.resource(
  "File Content",
  new ResourceTemplate("ctxnest://files/{id}", {
    list: undefined,
  }),
  {
    description: "Content of a specific file by ID",
    mimeType: "text/markdown",
  },
  async (uri, variables) => {
    const idValue = Array.isArray(variables.id) ? variables.id[0] : variables.id;
    const id = parseInt(idValue, 10);
    const file = readFile(id);

    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: file.content,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CtxNest MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
