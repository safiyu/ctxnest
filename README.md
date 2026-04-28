<p align="center">
  <img src="apps/web/src/components/theme/logo.png" alt="CtxNest Logo" width="180">
</p>

<h1 align="center">CtxNest v1.0</h1>

<p align="center">A centralized markdown context manager with Model Context Protocol (MCP) integration.</p>

---

CtxNest is a high-performance markdown file manager designed to centralize documentation and knowledge bases across projects. It features a premium three-pane UI and a built-in MCP server to provide seamless context to AI coding assistants like **Claude Code**, **Gemini CLI**, and **Cursor**.

## 🚀 Key Features

- **Model Context Protocol (MCP)**: Native integration for AI-powered coding tools.
- **Advanced Folder Management**: Secure, persistent hierarchical organization for your context.
- **Premium Aesthetics**: High-contrast rust-colored identity (#D4903A) with optimized Light/Dark modes.
- **Smart Sync**: Git-based remote synchronization and manual backup snapshots.
- **Rich Editing**: GFM-compliant WYSIWYG editor with syntax highlighting and table support.
- **Powerful Search**: Full-text search powered by SQLite FTS5.

## 🐳 Quick Start (Docker)

The fastest way to deploy CtxNest is using Docker Compose:

```bash
git clone <repository-url>
cd ctxnest
docker compose up -d --build
```
Access the UI at `http://localhost:3000`. Your data is persisted in `./ctxnest-data`.

## 🛠 Installation (Local)

```bash
pnpm install
pnpm build
pnpm dev
```

## 🤖 MCP Integration

To connect CtxNest to your AI tool, point it to the built server:

- **Server Path**: `apps/mcp/dist/index.js`
- **Environment**: 
  - `CTXNEST_DATA_DIR`: Path to your data directory.
  - `CTXNEST_DB_PATH`: Path to your `ctxnest.db`.

Example for **Claude Code**:
```bash
claude mcp add ctxnest -s user -- node /path/to/apps/mcp/dist/index.js -e CTXNEST_DATA_DIR=/path/to/data -e CTXNEST_DB_PATH=/path/to/ctxnest.db
```

## 🎨 UI & Aesthetics

Designed for industrial precision and focus:
- **Themes**: Crisp Light mode and obsidian Dark mode.
- **Branding**: Solid rust (#D4903A) accents throughout.
- **Icons**: Custom golden SVG iconography.

---

Built with care by Safiyu.
License: Apache-2.0
