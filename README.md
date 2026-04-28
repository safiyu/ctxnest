<p align="center">
  <img src="apps/web/src/components/theme/logo.png" alt="CtxNest Logo" width="200">
</p>

<h1 align="center">CtxNest</h1>

<p align="center">A centralized markdown context file manager with MCP server integration for AI coding assistants.</p>

CtxNest is a markdown file manager designed to centralize your context files, documentation, and knowledge base across projects. Built with a three-pane interface, it features full-text search, project management, Git-based versioning, and seamless integration with any MCP-compatible AI coding tool through a Model Context Protocol (MCP) server.

**Compatible with:** Claude Code, Gemini CLI, OpenAI Codex, Antigravity, Cursor, Windsurf, and any other tool that supports MCP.

## Features

- Three-pane layout UI for efficient file browsing and editing
- **Model Context Protocol (MCP) server** with 13 tools — works with Claude Code, Gemini CLI, Cursor, and more
- **Collaboration & Remote Sync**: Sync context across teams with Git-based push/pull/rebase support
- **Advanced Folder Management**: 
  - Create and organize context files into hierarchical structures
  - Delete empty folders directly from the UI with safety confirmations
  - Persistent folders even when empty of context files
- **Refined Premium Aesthetics**: 
  - Cohesive branding with rust-colored (#D4903A) visual identity
  - Optimized light and dark modes for high readability
  - Modern golden SVG iconography for file identification
- **Dynamic Context Creation**: Create new context files directly in the UI for Knowledge Base or Projects
- Full-text search powered by SQLite FTS5 (optimized internal content)
- Project-based organization with support for external project references
- Git-based versioning and backup synchronization
- WYSIWYG markdown editor with Tiptap v2 and **GFM table support**
- Beautiful syntax highlighting for code blocks using Shiki
- Resizable panes and keyboard navigation
- Real-time file watching and WebSocket updates
- Tag management and favorites system

## Screenshots

Screenshots coming soon.

## Tech Stack

| Category | Technology |
|----------|-----------|
| Monorepo | Turborepo + pnpm |
| Web Framework | Next.js 15 (App Router) |
| UI Components | shadcn/ui + Tailwind CSS |
| WYSIWYG Editor | Tiptap v2 |
| Markdown Rendering | react-markdown + rehype |
| Syntax Highlighting | Shiki |
| Database | better-sqlite3 + FTS5 |
| Git Operations | simple-git |
| File Watching | chokidar |
| MCP Server | @modelcontextprotocol/sdk |
| Real-time Updates | WebSocket (ws) |
| Runtime | Node.js 20+ |

## Architecture

CtxNest is a layered monorepo with a shared core service layer. A single Node.js process can run both the web app and MCP server.

```
ctxnest/
├── packages/
│   └── core/                # Shared service layer
│       ├── files/           # File CRUD (read/write .md to disk)
│       ├── git/             # Git operations (commit, log, diff, restore)
│       ├── metadata/        # SQLite: tags, favorites, projects, search
│       ├── watcher/         # Chokidar file system watcher
│       ├── db/              # SQLite setup, migrations, FTS5
│       │   └── migrations/  # Numbered SQL migration files
│       └── index.ts         # Public API surface
├── apps/
│   ├── web/                 # Next.js 15 app (three-pane UI)
│   └── mcp/                 # MCP server entry point (imports core)
├── data/                    # Storage root (git-tracked)
│   ├── knowledge/           # CtxNest-owned general knowledge base files
│   ├── projects/            # CtxNest-owned project-scoped docs
│   └── backups/             # Manual backup snapshots of project context files
│       ├── ctxnest/
│       └── pmo/
└── ctxnest.db               # SQLite database
```

The core principle: `packages/core` contains all business logic. Both the web app (via API routes) and MCP server (via tool handlers) are thin wrappers that delegate to core.

## Prerequisites

- Node.js 20 or higher
- pnpm 9 or higher
- Git

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd ctxnest
```

2. Install dependencies:

```bash
pnpm install
```

3. Build all packages:

```bash
pnpm build
```

## Usage

### Running the Web App

Start the development server:

```bash
pnpm dev
```

Open your browser to `http://localhost:3000` to access the three-pane UI.

### Connecting to AI Coding Tools

CtxNest uses the open MCP standard, so it works with any MCP-compatible client. Below are setup instructions for popular tools.

#### Claude Code

Run the following command to register ctxnest globally (available in all projects):

```bash
claude mcp add ctxnest -s user -- node /absolute/path/to/ctxnest/apps/mcp/dist/index.js \
  -e CTXNEST_DATA_DIR=/absolute/path/to/ctxnest/data \
  -e CTXNEST_DB_PATH=/absolute/path/to/ctxnest/data/ctxnest.db
```

To register for a single project only, use `-s project` instead of `-s user`.

Restart Claude Code after adding, then run `/mcp` to verify the connection.

#### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ctxnest": {
      "command": "node",
      "args": ["/absolute/path/to/ctxnest/apps/mcp/dist/index.js"],
      "env": {
        "CTXNEST_DATA_DIR": "/absolute/path/to/ctxnest/data",
        "CTXNEST_DB_PATH": "/absolute/path/to/ctxnest/ctxnest.db"
      }
    }
  }
}
```

#### OpenAI Codex

Add to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "ctxnest": {
      "command": "node",
      "args": ["/absolute/path/to/ctxnest/apps/mcp/dist/index.js"],
      "env": {
        "CTXNEST_DATA_DIR": "/absolute/path/to/ctxnest/data",
        "CTXNEST_DB_PATH": "/absolute/path/to/ctxnest/ctxnest.db"
      }
    }
  }
}
```

#### Cursor / Windsurf / Other MCP Clients

Most MCP-compatible editors use the same configuration format. Add an MCP server entry with:
- **Command:** `node`
- **Args:** path to `apps/mcp/dist/index.js`
- **Environment:** `CTXNEST_DATA_DIR` and `CTXNEST_DB_PATH`

Refer to your tool's documentation for where MCP server configs are stored.

#### Configuration Fields

| Field | Description |
|-------|-------------|
| `command` | The Node.js executable |
| `args` | Absolute path to the built MCP server entry point |
| `CTXNEST_DATA_DIR` | Root directory for file storage (knowledge base, projects, backups) |
| `CTXNEST_DB_PATH` | Path to the SQLite database file |

After adding the configuration, restart your tool. The 13 CtxNest tools will appear in the MCP tools list.

### Using the MCP Tools

CtxNest provides 13 MCP tools accessible from any connected AI coding assistant:

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `create_file` | Create a new markdown file in knowledge base or project | "Create a context file about TypeScript patterns" |
| `read_file` | Read a file by its ID | "Read the file with ID 5" |
| `update_file` | Update the content of an existing file | "Update file 3 with new content about React hooks" |
| `delete_file` | Delete a file by its ID | "Delete file 7" |
| `list_files` | List files with optional filters (project, tag, favorite, folder) | "List all files tagged with 'architecture'" |
| `search` | Full-text search across all files | "Search for files mentioning authentication" |
| `add_tags` | Add tags to a file | "Tag file 2 with 'backend' and 'api'" |
| `remove_tags` | Remove tags from a file | "Remove tag 3 from file 8" |
| `set_favorite` | Mark or unmark a file as favorite | "Mark file 4 as favorite" |
| `list_tags` | List all available tags | "Show me all tags" |
| `list_projects` | List all registered projects | "What projects are registered?" |
| `register_project` | Register a new external project and discover its markdown files | "Register the project at /home/user/myapp" |
| `sync_backup` | Create backup copies of project reference files | "Sync backups for project 2" |

### Example Interactions

**Creating a knowledge base file:**
```
Create a context file about GraphQL best practices in the knowledge base
```

**Searching across projects:**
```
Search for files that mention 'authentication' or 'auth'
```

**Managing project files:**
```
Register the project at /home/user/projects/myapp, then list all its markdown files
```

## API Reference

The web app exposes REST API endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | List all files with optional query filters |
| GET | `/api/files/:id` | Get a specific file by ID |
| POST | `/api/files` | Create a new file |
| PUT | `/api/files/:id` | Update a file's content |
| DELETE | `/api/files/:id` | Delete a file |
| GET | `/api/projects` | List all registered projects |
| POST | `/api/projects` | Register a new project |
| PATCH | `/api/projects/:id` | Update project (e.g. set remote_url) |
| POST | `/api/projects/:id/sync` | Sync backup and Git remote for a project |
| POST | `/api/folders` | Create a new directory in a project |
| GET | `/api/tags` | List all tags |
| POST | `/api/files/:id/tags` | Add tags to a file |
| DELETE | `/api/files/:id/tags` | Remove tags from a file |
| POST | `/api/files/:id/favorite` | Set favorite status |
| GET | `/api/search` | Full-text search with filters |

## Configuration

CtxNest supports the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `CTXNEST_DATA_DIR` | Root directory for file storage | `./data` |
| `CTXNEST_DB_PATH` | Path to SQLite database file | `./ctxnest.db` |

Set these in your environment or in the MCP server configuration.

## Project Structure

```
ctxnest/
├── apps/
│   ├── mcp/                          # MCP server application
│   │   ├── src/
│   │   │   └── index.ts              # MCP server entry point with tool handlers
│   │   ├── dist/                     # Compiled JavaScript
│   │   ├── package.json              # MCP server dependencies
│   │   └── tsconfig.json             # TypeScript configuration
│   └── web/                          # Next.js web application
│       ├── src/
│       │   ├── app/                  # App Router pages and layouts
│       │   ├── components/           # React components (three-pane UI)
│       │   └── lib/                  # Utility functions
│       ├── public/                   # Static assets
│       ├── package.json              # Web app dependencies
│       └── next.config.js            # Next.js configuration
├── packages/
│   └── core/                         # Shared business logic
│       ├── src/
│       │   ├── db/                   # Database setup and migrations
│       │   │   ├── index.ts          # SQLite initialization
│       │   │   └── migrations/       # SQL migration files (numbered)
│       │   ├── files/                # File CRUD operations
│       │   ├── git/                  # Git commit, log, diff, restore
│       │   ├── metadata/             # Tags, favorites, projects, search
│       │   ├── watcher/              # Chokidar file system watcher
│       │   └── index.ts              # Public API exports
│       ├── dist/                     # Compiled JavaScript
│       ├── package.json              # Core dependencies
│       └── tsconfig.json             # TypeScript configuration
├── data/                             # File storage (git-tracked)
│   ├── knowledge/                    # General knowledge base
│   ├── projects/                     # Project-specific docs owned by CtxNest
│   └── backups/                      # Backup snapshots of external project files
├── docs/
│   └── superpowers/
│       └── specs/                    # Design specifications
├── ctxnest.db                        # SQLite database (not in git)
├── package.json                      # Root package.json with workspace config
├── pnpm-workspace.yaml               # pnpm workspace definition
├── turbo.json                        # Turborepo pipeline configuration
└── README.md                         # This file
```

## Development

### Running Tests

Run all tests across the monorepo:

```bash
pnpm test
```

Run tests in watch mode:

```bash
cd packages/core
pnpm test:watch
```

### Building

Build all packages and applications:

```bash
pnpm build
```

Build a specific package:

```bash
cd packages/core
pnpm build
```

### Adding a New MCP Tool

1. Open `/home/user/mygenerators/ctxnest/apps/mcp/src/index.ts`
2. Add a new tool using `server.tool()`:

```typescript
server.tool(
  "tool_name",
  "Tool description",
  {
    // Zod schema for parameters
    param1: z.string().describe("Parameter description"),
  },
  async ({ param1 }) => {
    // Call core service function
    const result = await coreFunction(param1);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);
```

3. Implement the core service function in `packages/core/src/`
4. Rebuild the MCP server: `cd apps/mcp && pnpm build`
5. Restart Claude Code to pick up the new tool

## UI & Aesthetics

CtxNest features a high-contrast, premium interface designed for clarity and focus:

- **Branding**: Solid rust (#D4903A) visual identity inspired by industrial precision.
- **Themes**:
  - **Light Mode**: High-readability dark fonts and sharp borders for daylight environments.
  - **Dark Mode**: Soft charcoal and obsidian tones to reduce eye strain during long coding sessions.
- **Iconography**: Custom golden SVG icons for consistent file identification across the tree and file lists.
- **Interactions**: Smooth transitions, subtle hover effects, and clear visual feedback for all destructive actions.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

---

Built with care by Safiyu.
