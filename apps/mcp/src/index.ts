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
} from "@ctxnest/core";
import { join } from "node:path";
import { statSync, openSync, readSync, closeSync } from "node:fs";

const dataDir = process.env.CTXNEST_DATA_DIR || join(process.cwd(), "data");
const dbPath = process.env.CTXNEST_DB_PATH || join(dataDir, "ctxnest.db");

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

createDatabase(dbPath);

const server = new McpServer({
  name: "ctxnest",
  version: "3.0.0",
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
  "List files with optional filters",
  {
    project_id: z.number().optional().describe("Filter by project ID"),
    tag: z.string().optional().describe("Filter by tag name"),
    favorite: z.boolean().optional().describe("Filter by favorite status"),
    folder: z.string().optional().describe("Filter by folder path"),
    untagged: z.boolean().optional().describe("If true, return only files that have no tags. Useful for bulk-tagging workflows."),
    limit: z.number().optional().describe("Maximum number of results"),
    offset: z.number().optional().describe("Offset for pagination"),
  },
  async ({ project_id, tag, favorite, folder, untagged, limit, offset }) => {
    const filters: any = {};
    if (project_id !== undefined) filters.project_id = project_id;
    if (tag !== undefined) filters.tag = tag;
    if (favorite !== undefined) filters.favorite = favorite;
    if (folder !== undefined) filters.folder = folder;
    if (untagged !== undefined) filters.untagged = untagged;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const result = listFiles({ dataDir, filters });
    const annotated = result.map(annotateTokens);
    const total_est_tokens = annotated.reduce((s, f) => s + (f.est_tokens ?? 0), 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ files: annotated, total_est_tokens }, null, 2) }],
    };
  }
);

server.tool(
  "search",
  "Search files using full-text search",
  {
    query: z.string().describe("Search query"),
    project_id: z.number().optional().describe("Filter by project ID"),
    tags: z.array(z.string()).optional().describe("Filter by tags (all must match)"),
    favorite: z.boolean().optional().describe("Filter by favorite status"),
  },
  async ({ query, project_id, tags, favorite }) => {
    const filters: any = { query };
    if (project_id !== undefined) filters.project_id = project_id;
    if (tags !== undefined) filters.tags = tags;
    if (favorite !== undefined) filters.favorite = favorite;

    const result = search(filters);
    const annotated = result.map(annotateTokens);
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
    project_id: z.number().optional().describe("Filter by project ID"),
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
        content: [{ type: "text", text: JSON.stringify({ error: "Project path is required. Please provide the absolute path to the project, or use the current working directory." }, null, 2) }],
      };
    }
    const project = registerProject(name, path, description);
    const discoveredFiles = discoverFiles(project.id, dataDir);
    const annotated = discoveredFiles.map(annotateTokens);
    const total_est_tokens = annotated.reduce((s, f) => s + (f.est_tokens ?? 0), 0);
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
  "Clip a web page into the knowledge base as cleaned Markdown. Fetches the URL, extracts the main article content (Readability), converts to Markdown, and stores it under knowledge/urlclips/. Re-clipping the same URL updates the existing file in place.",
  {
    url: z.string().url().describe("The URL to clip"),
    title: z.string().optional().describe("Optional title override (defaults to the page's <title>)"),
  },
  async ({ url, title }) => {
    try {
      const file = await clipUrl({ url, title, dataDir });
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
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ code, message }) }],
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
