"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { ThreePane } from "@/components/layout/three-pane";
import { FolderTree } from "@/components/folder-tree/folder-tree";
import { FileList } from "@/components/file-list/file-list";
import { ContentPane } from "@/components/content/content-pane";
import { SearchDialog } from "@/components/search/search-dialog";
import { AboutDialog } from "@/components/about/about-dialog";
import { NewFileDialog } from "@/components/content/new-file-dialog";
import { NewFolderDialog } from "@/components/folder-tree/new-folder-dialog";
import { DeleteFolderDialog } from "@/components/folder-tree/delete-folder-dialog";
import { useProjects } from "@/hooks/use-projects";
import { useFiles } from "@/hooks/use-files";
import { useFolders } from "@/hooks/use-folders";
import { useWebSocket } from "@/hooks/use-websocket";

type SortBy = "name" | "updated_at" | "created_at";

export default function HomePage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [deleteFolderConfirmOpen, setDeleteFolderConfirmOpen] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<"projects" | "knowledge" | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("updated_at");
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);

  // Restore navigation state from sessionStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const storedSection = sessionStorage.getItem("selectedSection") as "projects" | "knowledge" | null;
    const storedProjectId = sessionStorage.getItem("selectedProjectId");
    if (storedSection) setSelectedSection(storedSection);
    if (storedProjectId) setSelectedProjectId(Number(storedProjectId));
  }, []);

  const { projects, loading: projectsLoading } = useProjects();

  const { files, loading: filesLoading, refresh: refreshFiles } = useFiles({
    project_id:
      selectedSection === "projects" ? selectedProjectId : undefined,
  });

  // Always fetch knowledge base files and folders
  const { files: allFiles, refresh: refreshAllFiles } = useFiles({});
  const knowledgeFiles = allFiles.filter((f) => !f.project_id);
  const { folders: knowledgeFolders, basePath: knowledgeBasePath } = useFolders(null, folderRefreshKey);
  // Fetch project-specific folders when a project is selected
  const { folders: projectFolders, basePath: projectBasePath } = useFolders(
    selectedSection === "projects" ? selectedProjectId : null,
    folderRefreshKey
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleWebSocketEvent = useCallback(
    (event: { type: string; path: string }) => {
      refreshFiles();
      refreshAllFiles();
      if (selectedFileId) {
        setSelectedFileId(null);
        setTimeout(() => setSelectedFileId(selectedFileId), 0);
      }
    },
    [refreshFiles, selectedFileId]
  );

  useWebSocket(handleWebSocketEvent);

  const handleSelectProject = (projectId: number) => {
    setSelectedProjectId(projectId);
    setSelectedSection("projects");
    setSelectedFileId(null);
    setSelectedFolder(null);
    sessionStorage.setItem("selectedSection", "projects");
    sessionStorage.setItem("selectedProjectId", String(projectId));
  };

  const handleSelectKnowledge = () => {
    setSelectedSection("knowledge");
    setSelectedProjectId(null);
    setSelectedFileId(null);
    setSelectedFolder(null);
    sessionStorage.setItem("selectedSection", "knowledge");
    sessionStorage.removeItem("selectedProjectId");
  };

  const handleSelectFile = (fileId: number) => {
    setSelectedFileId(fileId);
  };

  const handleSelectFolder = (folderPath: string | null) => {
    setSelectedFolder(folderPath);
    setSelectedFileId(null);
  };

  const handleSync = async () => {
    if (!selectedProjectId) return;
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/sync`, {
        method: "POST",
      });
      if (response.ok) {
        refreshFiles();
      }
    } catch (error) {
      console.error("Sync failed:", error);
    }
  };

  const handleUpdateRemote = async (url: string) => {
    if (!selectedProjectId) return;
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote_url: url }),
      });
      if (response.ok) {
        // Refresh projects to get the new remote_url
        window.location.reload(); // Simple way to refresh for now
      }
    } catch (error) {
      console.error("Failed to update remote URL:", error);
    }
  };

  const handleSearchSelect = (fileId: number) => {
    setSelectedFileId(fileId);
    setSearchOpen(false);
  };

  const handleCreateFile = async (
    title: string,
    content: string,
    destination: "knowledge" | "project" | "ctxnest",
    folder?: string
  ) => {
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          destination,
          projectId: selectedProjectId,
          folder,
        }),
      });
      if (response.ok) {
        refreshFiles();
        refreshAllFiles();
        setNewFileOpen(false);
      }
    } catch (error) {
      console.error("Failed to create file:", error);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        refreshFiles();
        refreshAllFiles();
        setFolderRefreshKey((k) => k + 1);
        setSelectedFileId(null);
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          projectId: targetProjectId && targetProjectId > 0 ? targetProjectId : null, 
          name 
        }),
      });
      if (response.ok) {
        setNewFolderOpen(false);
        // Navigate to the correct section so the folder appears
        if (!targetProjectId || targetProjectId === 0) {
          setSelectedSection("knowledge");
          setSelectedProjectId(null);
          setSelectedFolder(null);
          sessionStorage.setItem("selectedSection", "knowledge");
          sessionStorage.removeItem("selectedProjectId");
        }
        // Bump the key to trigger folder re-fetch without full page reload
        setFolderRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleDeleteFolder = () => {
    if (selectedFolder) {
      setDeleteFolderConfirmOpen(true);
    }
  };

  const onConfirmDeleteFolder = async () => {
    if (!selectedFolder) return;
    setDeletingFolder(true);
    try {
      const response = await fetch(`/api/folders?name=${encodeURIComponent(selectedFolder)}&projectId=${selectedProjectId || ""}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSelectedFolder(null);
        setFolderRefreshKey((k) => k + 1);
        setDeleteFolderConfirmOpen(false);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete folder");
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    } finally {
      setDeletingFolder(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        onSearch={() => setSearchOpen(true)}
        onNewFile={() => setNewFileOpen(true)}
        onAbout={() => setAboutOpen(true)}
      />

      <ThreePane
        left={
          <FolderTree
            projects={projects}
            projectFiles={files}
            knowledgeFiles={knowledgeFiles}
            selectedProjectId={selectedProjectId}
            selectedSection={selectedSection}
            selectedFolder={selectedFolder}
            projectFolders={projectFolders || []}
            knowledgeFolders={knowledgeFolders || []}
            projectBasePath={projectBasePath}
            knowledgeBasePath={knowledgeBasePath}
            onSelectProject={handleSelectProject}
            onSelectKnowledge={handleSelectKnowledge}
            onSelectFolder={handleSelectFolder}
            onSelectFile={handleSelectFile}
            onCreateFolder={(id) => {
              setTargetProjectId(id);
              setNewFolderOpen(true);
            }}
          />
        }
        middle={
          <FileList
            files={files}
            selectedFileId={selectedFileId}
            onSelectFile={handleSelectFile}
            sortBy={sortBy}
            onSortChange={setSortBy}
            selectedFolder={selectedFolder}
            selectedProject={selectedProject ?? null}
            onSync={handleSync}
            onUpdateRemote={handleUpdateRemote}
            onDeleteFolder={handleDeleteFolder}
          />
        }
        right={<ContentPane fileId={selectedFileId} onDelete={handleDeleteFile} />}
      />

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectFile={handleSearchSelect}
      />

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />

      <NewFileDialog
        open={newFileOpen}
        onClose={() => setNewFileOpen(false)}
        onCreate={handleCreateFile}
        currentProjectId={selectedProjectId}
        availableFolders={selectedSection === "knowledge" ? knowledgeFolders : projectFolders}
      />

      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreate={handleCreateFolder}
      />

      <DeleteFolderDialog
        open={deleteFolderConfirmOpen}
        folderName={selectedFolder || ""}
        onClose={() => setDeleteFolderConfirmOpen(false)}
        onConfirm={onConfirmDeleteFolder}
        loading={deletingFolder}
      />
    </div>
  );
}
