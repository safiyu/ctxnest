# Changelog

## 5.3.3 (2026-05-02)

### Fixed
- CI: Refined npm publish workflow to support OIDC/Trusted Publishing.

## 5.2.0 (2026-05-02)

### Distribution
- **npm package** — `ctxnest-mcp` is now published to npm. Install via `npx -y ctxnest-mcp` in any MCP-compatible client (Claude Desktop, Cursor, Codex, Continue, Gemini, Antigravity) — no Docker required for the MCP path. Existing Docker and Glama-registry installs are unchanged.
- **Tag-driven CI publish** — the `publish-npm.yml` workflow publishes on every bare-semver (`X.Y.Z`) tag push using npm trusted publishing (OIDC, no stored token).

### Robustness
- **Unsaved-edit guard** — clicking a folder, project, section, or another file while editing now prompts before discarding in-progress edits. Tab close / hard refresh during an unsaved edit triggers the browser's leave-this-page warning.
- **Favorites stay fresh** — toggling a star or editing tags from the right pane now refreshes the global file list immediately, so the Favorites section reflects the change without waiting for a watcher event.
- **Folder tree resilience** — `listProjectFolders` switched to `lstatSync` and skips symlinks, so a stray symlink loop in a project no longer blows the stack.
- **Atomic move** — `moveFile` rolls the disk rename back if the DB update fails, keeping disk and index in sync (previously a UPDATE failure left the file at the new path with the row pointing at the old one).
- **Selection-state cleanup** — favorites→KB transitions clear stale folder filters; create-folder navigates the user into the new folder instead of the section root.
- **API hardening** — `/api/files/upload` now rejects malformed `tags` payloads with 400 instead of silently ignoring them; `/api/folders` POST rejects `projectId === 0` instead of routing it to the knowledge base.
- **Fewer redundant fetches** — collapsed double `refresh()` calls across the websocket handler and create/delete/upload flows.

## 5.1.0 (2026-05-02)

### Favorites & UX
- **Favorites Section:** Added a dedicated "Favorites" section to the left-hand folder tree (right above Knowledge Base). This new view acts as a global filter that displays all starred files across your entire workspace (projects and knowledge base alike).
- **Navigation:** Seamless breadcrumb and selection state updates for the new Favorites context.

## 5.0.0 (2026-05-01)

### A Bigger MCP Toolbox (13 → 42 tools)
- **Section-level edits** — `read_file_outline`, `read_section`, and `update_file_section` let agents work on one heading at a time instead of pulling whole files. Big context-window win.
- **Search excerpts** — every `search` hit now carries a snippet around the match with `<<<…>>>` markers, so agents skip the "now read the file to see what matched" step.
- **Structure management** — folder ops (`list_folders`, `create_folder`, `delete_folder`) and `move_file` finally let agents organize the KB without bouncing to the web UI.
- **Batch + lookup + stats** — `create_files` / `read_files` / `delete_files` (≤500/call), `tag_search_results`, `read_file_by_path`, `stats`, and `suggest_tags` collapse the most common multi-call patterns into one call.
- **Metadata-only file inspection** — `describe_file` returns tags, history depth, related files, and link-aware backlinks WITHOUT pulling the body. Replaces 3-4 chained calls when an agent is "getting acquainted" with a file.
- **Range + regex reads** — `read_file_lines` for stack-trace-style line ranges; `grep_in_file` and `regex_search` catch what FTS5's tokenizer misses (URLs, identifiers, hyphenated terms).
- **Capture & recovery** — `journal_append` for timestamped daily notes, `diff_against_disk` and `refresh_index` for spotting and fixing drift after external edits or sync merges.

### Official Distribution
- **Glama Registry** — CtxNest is now officially published to the [Glama MCP Registry](https://glama.ai/mcp/registry) as `registry.glama.ai/mcp-ntrhtsg0bk:n6ifz00shv`.

### Robustness
- Fixed a `syncBackup` deadlock when a project's path equals the data dir.
- Extended the file-watcher denylist (`.next`, `.venv`, `dist`, build/cache dirs) so they no longer pollute the index.
- Sync-all timeouts now log loudly and broadcast an error so cascading stalls aren't silent.
- Stability fixes: cross-platform path handling (Windows separator), atomic favorite/tag updates, journal-append concurrency lock, race-safe folder fetches, consistent file-id validation across routes, restore-on-failure for global remote URL, and quieter middle-pane state recovery after unregistering a project.

### Tests
- New MCP smoke harness exercises every tool against a temp data dir; wired into `pnpm test`. **43/43 passing.**

## 4.0.0 (2026-05-01)

### Rock-Solid Backups
- **Better Docker Support** — Fixed the common "ownership" error when running CtxNest on Linux. The system now automatically handles permission issues so your files sync perfectly every time.
- **No File Left Behind** — Folders that were previously ignored (like the `scratch` folder) are now properly backed up. Your work is safe, even in folders you've hidden from Git.
- **Smarter Synchronization** — The system now automatically cleans up old records when you delete files from your computer, keeping your database lean and accurate.

### Refined User Experience
- **Intuitive Folder Browsing** — Navigating your files now works exactly like your computer's file explorer. Click a folder to see what's inside; click the project name to see the root files.
- **Premium Notifications** — No more generic browser alerts. All errors now appear in a beautiful, custom-designed window that clearly explains what happened and how to fix it.
- **Faster UI** — Optimized the way paths are handled to prevent crashes and ensure the app loads instantly, regardless of your operating system.

### New Recovery Tools
- **Time Travel for Files** — Added a powerful new tool that lets agents revert files to any previous version. If you make a mistake, you can jump back in time with a single click.

## 3.1.0 (2026-04-30)

### Smarter Agent Sessions
- **Catch up on what changed** — agents can ask "what's new since yesterday?" and get back just the files added or edited in that window. No more re-reading the whole knowledge base at the start of every session.
- **One-shot project map** — a single call returns a clean, indented outline of your entire knowledge base (folders, titles, tags). Roughly 5× more compact than listing files one by one, so agents see the big picture before deciding what to open.
- **Tags and size shown upfront** — file listings and search results now include tags and an estimated token count inline, so agents pick the right file without opening each one first.

### Smarter Web Clipping
- **Login-wall detection** — clipping a Confluence, Notion, or SSO-protected page used to silently save the login screen. Now CtxNest spots the wall and tells you which page asked for auth, so you can paste in a session cookie and try again.
- **Bring your own credentials** — the clipper accepts cookies and bearer tokens, so you can clip pages behind your own logins without exposing them to a third party.

## 3.0.0 (2026-04-30)

### Web Clipping & Semantic Intelligence
- **Native Web Clipping**: Added `clip_url` tool to the MCP server and a corresponding UI in the web app to clip web pages directly into the knowledge base as cleaned Markdown.
- **Semantic Discovery**: Introduced `find_related` to surface contextually relevant files based on shared tags.
- **Git Context History**: Added `get_history` and `get_diff` tools to track and explain how context files have evolved over time.

### Import/Export & Data Portability
- **Knowledge Base Export**: Implemented ZIP-based export for the entire knowledge base.
- **Batch Operations**: Added "Import/Export" feature to facilitate moving data between CtxNest instances.
- **Bulk Metadata Management**: Added "Untagged" filter to `list_files` for easier bulk-tagging and organization workflows.

### Core & Performance
- **Source Path Indexing**: Added new database index for `source_path` to optimize file lookups and synchronization.
- **Enhanced Token Estimation**: Standardized token counting heuristics across core and MCP layers.
- **Git Reliability**: Improved Git commit logic with explicit GPG-signing suppression for local backups.

### UI/UX Refinement
- **Animated Branding**: Introduced new animated logo components.
- **Knowledge Base UX**: Redesigned file list and content pane interactions.
- **Refined Status Indicators**: Improved real-time feedback for sync and background operations.

## 2.0.0 (2026-04-29)

### UI & UX Polish
- **Dynamic Status Bar**:
  - Redesigned the footer with a persistent project-specific sync button and a collapsible Global Sync menu.
  - Added real-time synchronization feedback with animated status indicators and stage reporting (e.g., "preparing", "working").
- **State Synchronization Fixes**:
  - Resolved a critical bug where project folders appeared empty during transitions by implementing immediate state resets in `useFiles` and `useFolders` hooks.
  - Eliminated the race condition between metadata loading and file list rendering.
- **Visual Enhancements**:
  - Upgraded the "Skeleton" loading state with a premium golden aesthetic to match the CtxNest brand identity.
  - Refined the `.DS_Store` exclusion logic to keep the workspace clean and free of system clutter.

### Maintenance & Security
- **Code Pruning**:
  - Identified and removed several legacy "dead code" components (`SyncPanel`, `GitWizardModal`, `UnregisterModal`, `FileItem`) to improve maintainability and bundle size.
- **Git & Environment**:
  - Standardized `.gitignore` to include system files and database artifacts.
  - Cleaned up duplicate entries in configuration files.

## 1.1.0 (2026-04-28)

### Features & Improvements
- **Global Vault Architecture**:
  - Transitioned from per-project Git configuration to a single centralized remote repository.
  - Added a global Git Configuration Wizard supporting SSH and HTTPS (PAT) authentication.
  - Implemented a "Sync All" feature to backup all registered projects with a single click.
- **True Two-Way Collaboration Sync**:
  - Sync engine upgraded from a "Local-Wins" backup to a true Two-Way Collaboration Client.
  - Natively pulls and merges remote changes (additions, modifications, deletions) directly into the local workspace.
  - Automatically indexes newly pulled remote files into the local SQLite database.
  - Accurately mirrors nested folder structures within the Git repository, moving away from flattened structures to prevent file collision.
- **Core Enhancements**:
  - Implemented strict cleanup logic to purge old duplicate folders in the local GitHub staging area.
  - Fixed an issue where locally deleted files were silently retained on disk and reappeared upon refresh.
  - Git engine now explicitly tracks and stages local file deletions using `--all` parameter.
## 1.0.0 (2026-04-21)

### Features & Improvements
- **Advanced Folder Management**:
  - Implemented secure deletion for empty Knowledge Base folders.
  - Added safety confirmation modals with contextual folder naming.
  - Improved folder tree stability; folders now persist even when empty.
  - Automated directory synchronization between the UI, database, and filesystem.
- **Premium UI & Aesthetics**:
  - Refined visual identity with a solid rust-colored (#D4903A) branding.
  - Replaced emoji icons with modern, uniform golden SVG iconography.
  - Optimized light mode with high-contrast fonts and sharp borders for maximum readability.
  - Darkened UI elements (TopBar, FileList) to improve focus and reduce eye strain.
- **Core Enhancements**:
  - Upgraded file deletion to perform physical cleanup on disk (`unlinkSync`).
  - Added recursive directory removal (`rmSync`) for robust folder management.
  - Improved API performance with metadata-enriched responses (`basePath` injection).
- **Bug Fixes**:
  - Resolved "ReferenceError" during folder refresh operations.
  - Fixed "ghost content" in the Markdown viewer after file deletion.
  - Corrected folder tree mapping issues for empty Knowledge Base subdirectories.

## 0.1.0 (2026-04-20)

- Initial release
- Core service layer
- MCP server
- Three-pane layout web UI
- Light/dark theme with warm amber accent
- Project registration and auto-discovery
- Manual backup sync with git versioning
