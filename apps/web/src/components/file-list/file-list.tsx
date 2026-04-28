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
  basePath?: string | null;
  onSync: () => void;
  onSyncAll: () => Promise<void>;
  globalRemoteUrl: string | null;
  onUpdateRemote: (url: string) => Promise<void>;
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
  basePath,
  onSync,
  onSyncAll,
  globalRemoteUrl,
  onUpdateRemote,
  onDeleteFolder,
}: FileListProps) {
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

    return result;
  }, [files, sortBy, selectedFolder, selectedProject, basePath]);

  return (
    <div className="flex flex-col h-full">
      <SyncPanel
        remoteUrl={globalRemoteUrl}
        onSync={selectedProject ? async () => onSync() : undefined}
        onSyncAll={onSyncAll}
        onUpdateRemote={onUpdateRemote}
      />
      <div className="px-4 py-2 bg-black/10 border-b border-[#222222] flex items-center justify-between">
        <div className="text-[10px] font-bold text-gray-500 tracking-[1px] uppercase">
          {filteredAndSorted.length} {filteredAndSorted.length === 1 ? "File" : "Files"}
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortBy)}
            className="text-[10px] font-bold bg-[#111111] border border-amber-accent/30 rounded px-2 pr-6 py-1 text-amber-accent/90 hover:text-amber-accent hover:border-amber-accent/60 transition-all cursor-pointer outline-none appearance-none"
          >
            <option value="name" className="bg-[#111111] text-amber-accent">NAME</option>
            <option value="updated_at" className="bg-[#111111] text-amber-accent">UPDATED</option>
            <option value="created_at" className="bg-[#111111] text-amber-accent">CREATED</option>
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] text-amber-accent/50">
            ▼
          </div>
        </div>
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
            
            {selectedFolder && onDeleteFolder && (
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
