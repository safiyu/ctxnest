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
}: FileListProps) {
  const [filter, setFilter] = useState("");

  const filteredAndSorted = useMemo(() => {
    let result = [...files];

    if (selectedFolder) {
      // Use explicit basePath if available (from FolderTree/API)
      if (basePath) {
        const normalizedBasePath = basePath.endsWith("/") ? basePath : basePath + "/";
        const folderPrefix = normalizedBasePath + selectedFolder + "/";
        result = result.filter((f) => f.path.startsWith(folderPrefix));
      } else if (selectedProject?.path) {
        // Fallback for projects if basePath not passed
        const normalizedProjectPath = selectedProject.path.endsWith("/")
          ? selectedProject.path
          : selectedProject.path + "/";
        const folderPrefix = normalizedProjectPath + selectedFolder + "/";
        result = result.filter((f) => f.path.startsWith(folderPrefix));
      } else {
        // Legacy fallback for knowledge base
        result = result.filter((f) => {
          const parts = f.path.split("/knowledge/");
          if (parts.length > 1) {
            return parts[1].startsWith(selectedFolder + "/");
          }
          return false;
        });
      }
    } else if (selectedProject?.path) {
      // Root of a project
      result = result.filter((f) => f.project_id === selectedProject.id);
    } else {
      // Root of knowledge base (legacy logic)
      result = result.filter((f) => !f.project_id);
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
        <span>{filteredAndSorted.length} {filteredAndSorted.length === 1 ? "file" : "files"}</span>
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
                <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5">
                  {formatRelative(file.updated_at)}
                </div>
              </button>
            );
          })
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
