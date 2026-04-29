"use client";

import { useMemo, useState, useEffect } from "react";
import { FileListFilter } from "./file-list-filter";
import { FileItem } from "./file-item";
import { UploadFilesDialog } from "./upload-files-dialog";

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
  loading?: boolean;
  projects?: Project[];
  onUploaded?: () => void;
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
  projects,
  onUploaded,
}: FileListProps) {
  const [filter, setFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => { setSelectedIds(new Set()); }, [selectedFolder, selectedProject?.id, selectedSection, filter]);

  const filteredAndSorted = useMemo(() => {
    let result = [...files];

    // Branch on selectedSection first. Inferring mode from path-data
    // presence races on hard refresh and falsely shows "folder is empty".
    if (selectedSection === "projects") {
      if (selectedProject) {
        result = result.filter((f) => f.project_id === selectedProject.id);
        if (selectedFolder) {
          const base = basePath || selectedProject.path;
          if (base) {
            const normalizedBase = base.endsWith("/") ? base : base + "/";
            const folderPrefix = normalizedBase + selectedFolder + "/";
            result = result.filter((f) => f.path.startsWith(folderPrefix));
          }
          // base not loaded yet -> stay on project-wide list (next render narrows).
        }
      } else {
        result = [];
      }
    } else if (selectedSection === "knowledge") {
      result = result.filter((f) => !f.project_id);
      if (selectedFolder && basePath) {
        const normalizedBase = basePath.endsWith("/") ? basePath : basePath + "/";
        const folderPrefix = normalizedBase + selectedFolder + "/";
        result = result.filter((f) => f.path.startsWith(folderPrefix));
      }
    } else {
      result = [];
    }

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
  }, [files, sortBy, selectedFolder, selectedProject, selectedSection, basePath, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="text-[11px] px-2 py-1 text-[var(--text-secondary)] hover:text-amber-accent"
          title="Upload markdown files"
        >
          ↑ Upload
        </button>
        {selectedSection === "projects" && selectedProject && !selectedFolder && (
          <a
            href={`/api/export/zip?project_id=${selectedProject.id}`}
            download
            className="text-[11px] px-2 py-1 text-[var(--text-secondary)] hover:text-amber-accent"
            title="Download project as ZIP"
          >
            ↓ Project ZIP
          </a>
        )}
        {selectedSection === "projects" && selectedProject && selectedFolder && (
          <a
            href={`/api/export/zip?project_id=${selectedProject.id}&folder=${encodeURIComponent(selectedFolder)}`}
            download
            className="text-[11px] px-2 py-1 text-[var(--text-secondary)] hover:text-amber-accent"
            title="Download folder as ZIP"
          >
            ↓ Folder ZIP
          </a>
        )}
        <button
          type="button"
          onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
          className={`ml-auto text-[11px] px-2 py-1 ${selectMode ? "text-amber-accent" : "text-[var(--text-secondary)] hover:text-amber-accent"}`}
          title="Toggle multi-select"
        >
          {selectMode ? "✓ Select" : "Select"}
        </button>
      </div>
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
        {selectMode && selectedIds.size > 0 && (
          <div className="sticky top-0 z-10 px-3 py-2 bg-[var(--bg-secondary)] border-b border-amber-accent/40 flex items-center justify-between text-[11px]">
            <span>{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <a
                href={`/api/export/zip?file_ids=${[...selectedIds].join(",")}`}
                download
                className="px-2 py-1 bg-amber-accent text-black font-bold rounded"
              >
                Download ZIP
              </a>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Clear
              </button>
            </div>
          </div>
        )}
        {filteredAndSorted.length > 0 ? (
          filteredAndSorted.map((file) => (
            <FileItem
              key={file.id}
              id={file.id}
              title={file.title}
              updatedAt={file.updated_at}
              active={file.id === selectedFileId}
              onClick={() => onSelectFile(file.id)}
              estTokens={file.est_tokens}
              selectMode={selectMode}
              selected={selectedIds.has(file.id)}
              onToggleSelect={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(file.id)) next.delete(file.id);
                  else next.add(file.id);
                  return next;
                });
              }}
            />
          ))
        ) : loading || (selectedSection === "projects" && !selectedProject) ? (
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

            {selectedSection === "knowledge" && selectedFolder && onDeleteFolder && (
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
      <UploadFilesDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        projects={projects ?? []}
        defaultProjectId={selectedSection === "projects" && selectedProject ? selectedProject.id : null}
        defaultFolder={selectedFolder ?? ""}
        onUploaded={() => {
          setUploadOpen(false);
          onUploaded?.();
        }}
      />
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
