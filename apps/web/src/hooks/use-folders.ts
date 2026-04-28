"use client";

import { useState, useEffect } from "react";

export function useFolders(projectId: number | null, refreshKey: number = 0) {
  const [folders, setFolders] = useState<string[]>([]);
  const [basePath, setBasePath] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchFolders() {
      setLoading(true);
      try {
        const url = projectId ? `/api/folders?projectId=${projectId}` : "/api/folders";
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setFolders(data.folders);
          setBasePath(data.basePath);
        }
      } catch (error) {
        console.error("Failed to fetch folders:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchFolders();
  }, [projectId, refreshKey]);

  return { folders, basePath, loading };
}
