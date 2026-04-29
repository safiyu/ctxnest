"use client";

import { useMemo, useState } from "react";
import { FileListFilter } from "./file-list-filter";

interface Project {
  id: number;
  name: string;
  path: string;
  remote_url: string | null;
}

interface File {
  id: number;
  path: string;
  title: string;
  updated_at: string;
  created_at: string;
  project_id?: number;
  size_bytes?: number | null;
  est_tokens?: number | null;
}

type SortBy = "name" | "updated_at" | "created_at";

interface FileListProps {
  files: File[];
  selectedFileId: number | null;
  onSelectFile: (fileId: number) => void;
  sortBy: SortBy;
  onSortChange: (sortBy: SortBy) => void;
  selectedFolder: string | null;
  selectedProject: Project | null;
  selectedSection?: "projects" | "knowledge" | null;
  basePath?: string | null;
  onSync: () => void;
  onUnregisterProject?: () => void;
  onDeleteFolder?: () => void;
  /** True while the files list is being fetched. Used to show a skeleton
   *  instead of the misleading "folder is empty" state during initial load. */
  loading?: boolean;
}

export function FileList({
  files,
  selectedFileId,
  onSelectFile,
  sortBy,
  onSortChange,
  selectedFolder,
  selectedProject,
  selectedSection,
  basePath,
  onSync,
  onUnregisterProject,
  onDeleteFolder,
  loading,
}: FileListProps) {
  const [filter, setFilter] = useState("");

  const filteredAndSorted = useMemo(() => {
    let result = [...files];

    // Branch on selectedSection FIRST. The previous version inferred mode
    // from path-data presence, which on hard-refresh races (basePath +
    // selectedProject?.path both null while async hooks settle) fell into
    // the KB legacy fallback even when the user was in projects mode —
    // producing a false "folder is empty" until back-and-forth clicks
    // gave the data time to load.
    if (selectedSection === "projects") {
      // Project mode — narrow to the project's files first.
      if (selectedProject) {
        result = result.filter((f) => f.project_id === selectedProject.id);
        if (selectedFolder) {
          const base = basePath || selectedProject.path;
          if (base) {
            const normalizedBase = base.endsWith("/") ? base : base + "/";
            const folderPrefix = normalizedBase + selectedFolder + "/";
            result = result.filter((f) => f.path.startsWith(folderPrefix));
          }
          // Path data not loaded yet: stay on the project-wide list rather
          // than narrowing to nothing. The folder filter applies on the
          // next render once useFolders/useProjects resolve.
        }
      } else {
        // selectedProjectId set but the project record hasn't loaded yet —
        // show nothing rather than wrong things.
        result = [];
      }
    } else if (selectedSection === "knowledge") {
      result = result.filter((f) => !f.project_id);
      if (selectedFolder && basePath) {
        const normalizedBase = basePath.endsWith("/") ? basePath : basePath + "/";
        const folderPrefix = normalizedBase + selectedFolder + "/";
        result = result.filter((f) => f.path.startsWith(folderPrefix));
      }
      // basePath missing: stay on the KB-wide list (same rationale as above).
    } else {
      // No section selected.
      result = [];
    }

    // Sort files
    switch (sortBy) {
      case "name":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "updated_at":
        result.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        break;
      case "created_at":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
    }

    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((f) => f.title.toLowerCase().includes(q));
    }

    return result;
  }, [files, sortBy, selectedFolder, selectedProject, basePath, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
        <span>
          {filteredAndSorted.length} {filteredAndSorted.length === 1 ? "file" : "files"}
          {(() => {
            const total = filteredAndSorted.reduce((sum, f) => sum + (f.est_tokens ?? 0), 0);
            return total > 0 ? ` · ~${formatTokens(total)} tok` : "";
          })()}
        </span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="bg-transparent text-[11px] uppercase tracking-wider focus:outline-none cursor-pointer"
        >
          <option value="updated_at">updated</option>
          <option value="created_at">created</option>
          <option value="name">name</option>
        </select>
      </div>
      {files.length > 10 && <FileListFilter value={filter} onChange={setFilter} />}

      <div className="flex-1 overflow-y-auto">
        {filteredAndSorted.length > 0 ? (
          filteredAndSorted.map((file) => {
            const isActive = file.id === selectedFileId;
            return (
              <button
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`relative w-full text-left px-3 py-2 border-b border-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors ${
                  isActive ? "bg-[var(--accent-soft)]" : ""
                }`}
              >
                {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[var(--accent)]" />}
                <div className="text-[14px] text-[var(--text-primary)] font-medium truncate">{file.title}</div>
                <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                  <span>{formatRelative(file.updated_at)}</span>
                  {file.est_tokens != null && (
                    <>
                      <span className="text-[var(--border)]">·</span>
                      <span title={`~${file.est_tokens.toLocaleString()} tokens (heuristic: bytes/4)`}>
                        ~{formatTokens(file.est_tokens)} tok
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })
        ) : loading || (selectedSection === "projects" && !selectedProject) ? (
          // Skeleton: prevents the misleading "folder is empty" flash while
          // the files list is mid-fetch. Render a few placeholder rows that
          // match the real row layout (title line + meta line).
          <div aria-label="Loading files" role="status">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="px-3 py-2 border-b border-[var(--bg-tertiary)]">
                <div className="skeleton h-3.5" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
                <div className="skeleton h-2.5 mt-2" style={{ width: `${30 + ((i * 7) % 20)}%` }} />
              </div>
            ))}
          </div>
        ) : !selectedSection ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#475569] dark:text-[#94A3B8] gap-4">
            <span className="text-6xl opacity-30 dark-icon">📂</span>
            <div className="text-center px-6">
              <p className="text-lg font-bold text-[var(--text-primary)]">No Selection</p>
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                Please select a project or the Knowledge Base from the sidebar to view files.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-[#475569] dark:text-[#94A3B8] gap-4">
            <span className="text-6xl opacity-30 dark-icon">📂</span>
            <div className="text-center px-6">
              <p className="text-lg font-bold text-[var(--text-primary)]">Folder is empty</p>
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                This folder doesn't contain any indexed context files.
              </p>
            </div>

            {selectedFolder && onDeleteFolder && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="h-px w-16 bg-[var(--border)]" />
                <button
                  onClick={onDeleteFolder}
                  className="px-6 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-lg text-sm font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-all btn-press shadow-sm"
                >
                  DELETE THIS FOLDER
                </button>
                <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Permanent Action</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!isFinite(ts)) return iso;
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
