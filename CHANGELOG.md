# Changelog

## 4.0.0 (2026-05-01)

### Docker & Git Stability
- **"Dubious Ownership" Resolution** — Added a system-level Git configuration to the Docker image that automatically trusts mounted project volumes. This eliminates the common `fatal: detected dubious ownership` error when running CtxNest in Docker on Linux.
- **Forced Sync for Ignored Files** — Synchronization now uses the force flag (`git add -f`) to ensure that critical context files (like those in a `scratch/` folder) are correctly backed up even if they are covered by local `.gitignore` rules.
- **Idempotent Repo Initialization** — The Git engine now automatically registers directories as safe during initialization, ensuring a smooth first-run experience in containerized environments.

### UI & UX Enhancements
- **Non-Recursive Folder Explorer** — Redesigned the File List filtering to match standard file explorer behavior. Clicking a folder now shows only the files directly inside it, while clicking the project root shows only the root files.
- **Premium Error Reporting** — Replaced native browser alerts with a custom, high-fidelity `GitErrorDialog`. Git failures now appear in a sleek modal that explains why a commit failed and how it affects history.
- **Robust Path Normalization** — Hardened the client-side path logic to handle cross-platform separators (Windows backslashes vs. Linux forward-slashes) and prevent UI crashes when metadata is incomplete.

### New Features & Tools
- **File Restoration** — Added a new `restore_file` MCP tool. Agents can now programmatically revert files to any previous version using hashes retrieved from the Git history.
- **Automatic Pruning** — Improved project synchronization to automatically prune stale file records from the database if the corresponding files are deleted from the local filesystem.

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
