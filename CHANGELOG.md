# Changelog

## 1.0.0 (2026-04-28)

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
