"use client";

import { useMemo } from "react";
import { FileItem } from "./file-item";
import { SyncPanel } from "./sync-panel";

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
  onSync: () => Promise<void>;
  onUpdateRemote: (url: string) => Promise<void>;
  onDeleteFolder?: () => Promise<void>;
}

export function FileList({
  files,
  selectedFileId,
  onSelectFile,
  sortBy,
  onSortChange,
  selectedFolder,
  selectedProject,
  onSync,
  onUpdateRemote,
  onDeleteFolder,
}: FileListProps) {
  const projectPath = selectedProject?.path ?? null;
  const filteredAndSorted = useMemo(() => {
    let result = [...files];

    if (selectedFolder) {
      if (projectPath) {
        const normalizedProjectPath = projectPath.endsWith("/")
          ? projectPath
          : projectPath + "/";
        const folderPrefix = normalizedProjectPath + selectedFolder + "/";
        result = result.filter((f) => f.path.startsWith(folderPrefix));
      } else {
        // Knowledge base files — check if they are in the folder
        // Paths for KB files are usually absolute: /.../knowledge/folder/file.md
        // We can check if the folder is part of the path
        result = result.filter((f) => {
          const parts = f.path.split("/knowledge/");
          if (parts.length < 2) return false;
          return parts[1].startsWith(selectedFolder + "/");
        });
      }
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

    return result;
  }, [files, sortBy, selectedFolder, projectPath]);

  return (
    <div className="flex flex-col h-full">
      {selectedProject && (
        <SyncPanel
          projectId={selectedProject.id}
          remoteUrl={selectedProject.remote_url}
          onSync={onSync}
          onUpdateRemote={onUpdateRemote}
        />
      )}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-[#333333] flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide">
          {filteredAndSorted.length} {filteredAndSorted.length === 1 ? "FILE" : "FILES"}
        </div>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="text-xs font-medium bg-transparent border border-gray-300 dark:border-[#333333] rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-accent"
        >
          <option value="name">Sort by Name</option>
          <option value="updated_at">Sort by Updated</option>
          <option value="created_at">Sort by Created</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredAndSorted.length > 0 ? (
          filteredAndSorted.map((file) => (
            <FileItem
              key={file.id}
              title={file.title}
              updatedAt={file.updated_at}
              active={selectedFileId === file.id}
              onClick={() => onSelectFile(file.id)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-[#475569] dark:text-[#94A3B8] gap-4">
            <span className="text-6xl opacity-30 dark-icon">📂</span>
            <div className="text-center px-6">
              <p className="text-lg font-bold text-[var(--text-primary)]">Folder is empty</p>
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                This folder doesn't contain any indexed context files.
              </p>
            </div>
            
            {selectedFolder && !selectedProject && onDeleteFolder && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="h-px w-16 bg-[var(--border)]" />
                <button
                  onClick={onDeleteFolder}
                  className="px-6 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-lg text-sm font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-all btn-press shadow-sm"
                >
                  DELETE THIS FOLDER
                </button>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Permanent Action</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
