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
} from "@ctxnest/core";
import { join } from "node:path";

// Initialize database from environment variables or defaults
const dataDir = process.env.CTXNEST_DATA_DIR || join(process.cwd(), "data");
const dbPath = process.env.CTXNEST_DB_PATH || join(dataDir, "ctxnest.db");

// Create database instance
createDatabase(dbPath);

// Create MCP server
const server = new McpServer({
  name: "ctxnest",
  version: "0.1.0",
});

// Register tool: create_file
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
    const result = createFile({
      title,
      content,
      destination,
      projectId: project_id,
      folder,
      tags,
      dataDir,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Register tool: read_file
server.tool(
  "read_file",
  "Read a file by its ID",
  {
    id: z.number().describe("File ID"),
  },
  async ({ id }) => {
    const result = readFile(id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Register tool: update_file
server.tool(
  "update_file",
  "Update the content of an existing file",
  {
    id: z.number().describe("File ID"),
    content: z.string().describe("New content"),
  },
  async ({ id, content }) => {
    const result = updateFile(id, content);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Register tool: delete_file
server.tool(
  "delete_file",
  "Delete a file by its ID",
  {
    id: z.number().describe("File ID"),
  },
  async ({ id }) => {
    deleteFile(id);
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
    };
  }
);

// Register tool: list_files
server.tool(
  "list_files",
  "List files with optional filters",
  {
    project_id: z.number().optional().describe("Filter by project ID"),
    tag: z.string().optional().describe("Filter by tag name"),
    favorite: z.boolean().optional().describe("Filter by favorite status"),
    folder: z.string().optional().describe("Filter by folder path"),
    limit: z.number().optional().describe("Maximum number of results"),
    offset: z.number().optional().describe("Offset for pagination"),
  },
  async ({ project_id, tag, favorite, folder, limit, offset }) => {
    const filters: any = {};
    if (project_id !== undefined) filters.project_id = project_id;
    if (tag !== undefined) filters.tag = tag;
    if (favorite !== undefined) filters.favorite = favorite;
    if (folder !== undefined) filters.folder = folder;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const result = listFiles({ dataDir, filters });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Register tool: search
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
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Register tool: add_tags
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

// Register tool: remove_tags
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

// Register tool: set_favorite
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

// Register tool: list_tags
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

// Register tool: list_projects
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

// Register tool: register_project
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
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project,
              discovered_files_count: discoveredFiles.length,
              discovered_files: discoveredFiles,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Register tool: sync_backup
server.tool(
  "sync_backup",
  "Sync backup copies of project reference files",
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

// Register resource: ctxnest://projects
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

// Register resource template: ctxnest://files/{id}
server.resource(
  "File Content",
  new ResourceTemplate("ctxnest://files/{id}", {
    list: undefined, // Template resources don't need list implementation
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

// Main function
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CtxNest MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
