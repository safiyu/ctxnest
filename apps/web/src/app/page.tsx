"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { ThreePane } from "@/components/layout/three-pane";
import { FolderTree } from "@/components/folder-tree/folder-tree";
import { FileList } from "@/components/file-list/file-list";
import { ContentPane } from "@/components/content/content-pane";
import { SearchDialog } from "@/components/search/search-dialog";
import { AboutDialog } from "@/components/about/about-dialog";
import { useProjects } from "@/hooks/use-projects";
import { useFiles } from "@/hooks/use-files";
import { useWebSocket } from "@/hooks/use-websocket";

type SortBy = "name" | "updated_at" | "created_at";

export default function HomePage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null
  );
  const [selectedSection, setSelectedSection] = useState<
    "projects" | "knowledge" | null
  >(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("updated_at");

  const { projects, loading: projectsLoading } = useProjects();

  const { files, loading: filesLoading, refresh: refreshFiles } = useFiles({
    project_id:
      selectedSection === "projects" ? selectedProjectId : undefined,
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleWebSocketEvent = useCallback(
    (event: { type: string; path: string }) => {
      refreshFiles();
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
  };

  const handleSelectKnowledge = () => {
    setSelectedSection("knowledge");
    setSelectedProjectId(null);
    setSelectedFileId(null);
    setSelectedFolder(null);
  };

  const handleSelectFile = (fileId: number) => {
    setSelectedFileId(fileId);
  };

  const handleSelectFolder = (folderPath: string | null) => {
    setSelectedFolder(folderPath);
    setSelectedFileId(null);
  };

  const handleSearchSelect = (fileId: number) => {
    setSelectedFileId(fileId);
    setSearchOpen(false);
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
        onNewFile={() => {
          console.log("New file clicked");
        }}
        onAbout={() => setAboutOpen(true)}
      />

      <ThreePane
        left={
          <FolderTree
            projects={projects}
            projectFiles={files}
            selectedProjectId={selectedProjectId}
            selectedSection={selectedSection}
            selectedFolder={selectedFolder}
            onSelectProject={handleSelectProject}
            onSelectKnowledge={handleSelectKnowledge}
            onSelectFolder={handleSelectFolder}
            onSelectFile={handleSelectFile}
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
            projectPath={selectedProject?.path ?? null}
          />
        }
        right={<ContentPane fileId={selectedFileId} />}
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
    </div>
  );
}
