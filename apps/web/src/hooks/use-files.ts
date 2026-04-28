"use client";

import { useState, useEffect } from "react";

interface File {
  id: number;
  path: string;
  project_id: number;
  title: string;
  content: string;
  storage_type: "db" | "git";
  tags: string[] | null;
  favorite: boolean;
  folder: string | null;
  created_at: string;
  updated_at: string;
}

interface UseFilesOptions {
  project_id?: number | null;
  tag?: string;
  favorite?: boolean;
  folder?: string;
}

interface UseFilesReturn {
  files: File[];
  loading: boolean;
  refresh: () => void;
}

export function useFiles(options: UseFilesOptions = {}): UseFilesReturn {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (options.project_id !== undefined && options.project_id !== null) {
        params.append("project_id", options.project_id.toString());
      }
      if (options.tag) {
        params.append("tag", options.tag);
      }
      if (options.favorite !== undefined) {
        params.append("favorite", options.favorite.toString());
      }
      if (options.folder) {
        params.append("folder", options.folder);
      }

      const url = `/api/files${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [options.project_id, options.tag, options.favorite, options.folder]);

  return {
    files,
    loading,
    refresh: fetchFiles,
  };
}
