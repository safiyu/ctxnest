"use client";

import { useMemo } from "react";
import { FileItem } from "./file-item";

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
  projectPath: string | null;
}

export function FileList({
  files,
  selectedFileId,
  onSelectFile,
  sortBy,
  onSortChange,
  selectedFolder,
  projectPath,
}: FileListProps) {
  const filteredAndSorted = useMemo(() => {
    let result = [...files];

    if (selectedFolder && projectPath) {
      const normalizedProjectPath = projectPath.endsWith("/")
        ? projectPath
        : projectPath + "/";
      const folderPrefix = normalizedProjectPath + selectedFolder + "/";
      result = result.filter((f) => f.path.startsWith(folderPrefix));
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
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <span className="text-4xl opacity-30">📑</span>
            <p className="text-sm font-medium">No files yet</p>
            <p className="text-xs text-gray-500">Files in this folder will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
