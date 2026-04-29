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
import { useMediaQuery } from "@/hooks/use-media-query";
import { Breadcrumb, type BreadcrumbSegment } from "@/components/layout/breadcrumb";
import { StatusBar } from "@/components/layout/status-bar";
import { IconRail } from "@/components/layout/icon-rail";

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

  const [globalRemoteUrl, setGlobalRemoteUrl] = useState<string | null>(null);

  const fetchGlobalRemote = useCallback(async () => {
    try {
      const res = await fetch("/api/git/remote");
      if (res.ok) {
        const data = await res.json();
        setGlobalRemoteUrl(data.remote_url);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchGlobalRemote();
  }, [fetchGlobalRemote]);

  const { projects, loading: projectsLoading, refresh: refreshProjects } = useProjects();

  const handleUnregisterProject = async () => {
    if (!selectedProjectId) return;
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSelectedProjectId(null);
        setSelectedSection(null);
        setSelectedFolder(null);
        setSelectedFileId(null);
        sessionStorage.removeItem("selectedSection");
        sessionStorage.removeItem("selectedProjectId");
        refreshProjects();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to unregister project");
      }
    } catch (error) {
      console.error("Failed to unregister project:", error);
    }
  };

  const { files, loading: filesLoading, refresh: refreshFiles } = useFiles({
    project_id:
      selectedSection === "projects" ? selectedProjectId : null,
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
    (_event: { type: string; path: string }) => {
      // Refresh the file lists so the sidebar reflects external changes,
      // but DO NOT toggle selectedFileId. The previous "null then restore"
      // dance reset ContentPane's editing state on every watcher event,
      // silently dropping unsaved edits whenever any .md under data/
      // changed (including unrelated files in other projects).
      refreshFiles();
      refreshAllFiles();
    },
    [refreshFiles, refreshAllFiles]
  );

  useWebSocket(handleWebSocketEvent);

  const isPhone = useMediaQuery("(max-width: 767px)");

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

  // Atomically switches to KB section AND selects a specific folder
  // (avoids the race where handleSelectKnowledge clears selectedFolder)
  const handleSelectKnowledgeFolder = (folderPath: string | null) => {
    setSelectedSection("knowledge");
    setSelectedProjectId(null);
    setSelectedFileId(null);
    setSelectedFolder(folderPath);
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
    const response = await fetch(`/api/projects/${selectedProjectId}/sync`, {
      method: "POST",
    });
    if (response.ok) {
      refreshFiles();
    } else {
      const data = await response.json();
      throw new Error(data.error || "Sync failed");
    }
  };

  const handleSyncAll = async () => {
    const response = await fetch("/api/git/sync-all", { method: "POST" });
    if (response.ok || response.status === 207) {
      refreshFiles();
    } else {
      const data = await response.json();
      throw new Error(data.error || "Sync All failed");
    }
  };

  const handleUpdateGlobalRemote = async (url: string) => {
    try {
      const response = await fetch("/api/git/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote_url: url }),
      });
      if (response.ok) {
        setGlobalRemoteUrl(url);
      } else {
        throw new Error("Failed to update global remote");
      }
    } catch (error) {
      console.error("Failed to update remote URL:", error);
      throw error;
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

  const breadcrumbSegments: BreadcrumbSegment[] = (() => {
    const segs: BreadcrumbSegment[] = [];
    // Section root
    if (selectedSection === "knowledge") {
      segs.push({ label: "Knowledge", onClick: handleSelectKnowledge });
    } else if (selectedSection === "projects" && selectedProject) {
      segs.push({ label: selectedProject.name, onClick: () => handleSelectProject(selectedProject.id) });
    }

    // Resolve the selected file (may be from either pool)
    const file = selectedFileId
      ? files.find((x) => x.id === selectedFileId) || allFiles.find((x) => x.id === selectedFileId)
      : null;

    // Compute the section base path so we can derive the file's folder chain
    // even when the user clicked it from the project root (no selectedFolder).
    const sectionBase =
      selectedSection === "projects"
        ? selectedProject?.path ?? null
        : knowledgeBasePath ?? null;

    let folderSegments: string[] = [];
    if (file && sectionBase && file.path?.startsWith(sectionBase)) {
      const rel = file.path.slice(sectionBase.length).replace(/^\/+/, "");
      const parts = rel.split("/").filter(Boolean);
      folderSegments = parts.slice(0, -1); // drop the filename
    } else if (selectedFolder) {
      // No file selected, but a folder is — render its segments.
      folderSegments = selectedFolder.split("/").filter(Boolean);
    }

    folderSegments.forEach((part) => segs.push({ label: part }));

    if (file) segs.push({ label: file.title });
    return segs;
  })();

  const railItems = projects.map((p) => ({
    id: `p-${p.id}`,
    label: p.name,
    active: selectedSection === "projects" && selectedProjectId === p.id,
    onClick: () => handleSelectProject(p.id),
  }));

  const railFooter = {
    id: "kb",
    label: "Knowledge Base",
    active: selectedSection === "knowledge",
    onClick: handleSelectKnowledge,
  };

  if (isPhone) {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-6 text-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <div className="text-2xl font-extrabold tracking-[4px] text-[var(--accent)] mb-3">CTXNEST</div>
        <p className="text-sm text-[var(--text-secondary)] max-w-xs">
          CtxNest is best used on a tablet or larger screen. Open this URL on a wider device to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        onSearch={() => setSearchOpen(true)}
        onNewFile={() => setNewFileOpen(true)}
        onAbout={() => setAboutOpen(true)}
      />
      <Breadcrumb segments={breadcrumbSegments} />

      <ThreePane
        leftRail={<IconRail items={railItems} footer={railFooter} />}
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
            onSelectKnowledgeFolder={handleSelectKnowledgeFolder}
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
            selectedSection={selectedSection}
            basePath={selectedSection === "projects" ? projectBasePath : knowledgeBasePath}
            onSync={handleSync}
            onUnregisterProject={handleUnregisterProject}
            onDeleteFolder={handleDeleteFolder}
          />
        }
        right={<ContentPane fileId={selectedFileId} onDelete={handleDeleteFile} />}
      />
      <StatusBar
        globalRemoteUrl={globalRemoteUrl}
        onSyncAll={handleSyncAll}
        onUpdateRemote={handleUpdateGlobalRemote}
        selectedProjectName={selectedSection === "projects" ? selectedProject?.name ?? null : null}
        onSyncProject={selectedSection === "projects" && selectedProjectId ? handleSync : undefined}
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
