"use client";

import { useMemo } from "react";
import { TreeNode } from "./tree-node";
import { buildFolderTree, FolderTreeNode } from "@/lib/build-folder-tree";

interface Project {
  id: number;
  name: string;
  path: string;
}

interface ProjectFile {
  id: number;
  path: string;
  title: string;
}

interface FolderTreeProps {
  projects: Project[];
  projectFiles: ProjectFile[];
  knowledgeFiles: ProjectFile[];
  selectedProjectId: number | null;
  selectedSection: "projects" | "knowledge" | null;
  selectedFolder: string | null;
  projectFolders: string[];
  knowledgeFolders: string[];
  onSelectProject: (projectId: number) => void;
  onSelectKnowledge: () => void;
  onSelectFolder: (folderPath: string | null) => void;
  onSelectFile: (fileId: number) => void;
  onCreateFolder: (projectId: number) => void;
}

function FolderNodes({
  node,
  selectedFolder,
  onSelectFolder,
  onSelectFile,
}: {
  node: FolderTreeNode;
  selectedFolder: string | null;
  onSelectFolder: (folderPath: string | null) => void;
  onSelectFile: (fileId: number) => void;
}) {
  return (
    <>
      {node.children.map((child) => (
        <TreeNode
          key={child.path}
          label={child.name}
          icon="📂"
          active={selectedFolder === child.path}
          onClick={() => onSelectFolder(child.path)}
        >
          <FolderNodes
            node={child}
            selectedFolder={selectedFolder}
            onSelectFolder={onSelectFolder}
            onSelectFile={onSelectFile}
          />
        </TreeNode>
      ))}
      {node.files.map((file) => (
        <TreeNode
          key={file.id}
          label={file.title}
          icon="📄"
          onClick={() => onSelectFile(file.id)}
        />
      ))}
    </>
  );
}

export function FolderTree({
  projects,
  projectFiles,
  knowledgeFiles,
  selectedProjectId,
  selectedSection,
  selectedFolder,
  projectFolders,
  knowledgeFolders,
  onSelectProject,
  onSelectKnowledge,
  onSelectFolder,
  onSelectFile,
  onCreateFolder,
}: FolderTreeProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Tree for the selected project
  const projectFolderTree = useMemo(() => {
    if (!selectedProject) return null;
    return buildFolderTree(projectFiles, selectedProject.path, projectFolders);
  }, [projectFiles, selectedProject, projectFolders]);

  // Tree for Knowledge Base — always built, independent of selectedSection
  const knowledgeFolderTree = useMemo(() => {
    if (knowledgeFolders.length === 0 && knowledgeFiles.length === 0) return null;
    if (knowledgeFiles.length > 0) {
      const firstPath = knowledgeFiles[0].path;
      const idx = firstPath.indexOf("/knowledge/");
      if (idx !== -1) {
        const prefix = firstPath.substring(0, idx + 11);
        return buildFolderTree(knowledgeFiles, prefix, knowledgeFolders);
      }
    }
    return buildFolderTree([], "", knowledgeFolders);
  }, [knowledgeFiles, knowledgeFolders]);

  return (
    <div className="p-4 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3 px-3">
          <div className="text-amber-accent text-xs font-bold tracking-[1.5px]">
            PROJECTS
          </div>
        </div>
        <div className="space-y-1">
          {projects.map((project) => {
            const isSelected = selectedProjectId === project.id;
            return (
              <TreeNode
                key={project.id}
                label={project.name}
                icon="📁"
                active={isSelected && selectedFolder === null}
                initialExpanded={isSelected}
                onClick={() => {
                  onSelectProject(project.id);
                  onSelectFolder(null);
                }}
              >
                {isSelected && projectFolderTree ? (
                  <FolderNodes
                    node={projectFolderTree}
                    selectedFolder={selectedFolder}
                    onSelectFolder={onSelectFolder}
                    onSelectFile={onSelectFile}
                  />
                ) : undefined}
              </TreeNode>
            );
          })}
          {projects.length === 0 && (
            <div className="flex flex-col items-center py-6 text-gray-400 gap-2">
              <span className="text-3xl opacity-30">📁</span>
              <p className="text-xs font-medium">No projects yet</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 px-3">
          <div className="text-amber-accent text-xs font-bold tracking-[1.5px]">
            KNOWLEDGE BASE
          </div>
          <button
            onClick={() => onCreateFolder(0)}
            className="text-[10px] font-bold text-gray-500 hover:text-amber-accent transition-colors"
          >
            + FOLDER
          </button>
        </div>
        <TreeNode
          label="All Knowledge"
          icon="📚"
          active={selectedSection === "knowledge"}
          initialExpanded={selectedSection === "knowledge"}
          onClick={onSelectKnowledge}
        >
          {knowledgeFolderTree ? (
            <FolderNodes
              node={knowledgeFolderTree}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
              onSelectFile={onSelectFile}
            />
          ) : undefined}
        </TreeNode>
      </div>
    </div>
  );
}
