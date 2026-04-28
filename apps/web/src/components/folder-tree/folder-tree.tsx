"use client";

import { useMemo } from "react";
import { TreeNode } from "./tree-node";
import {
  buildFolderTree,
  FolderTreeNode,
} from "@/lib/build-folder-tree";

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
  selectedProjectId: number | null;
  selectedSection: "projects" | "knowledge" | null;
  selectedFolder: string | null;
  onSelectProject: (projectId: number) => void;
  onSelectKnowledge: () => void;
  onSelectFolder: (folderPath: string | null) => void;
  onSelectFile: (fileId: number) => void;
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
  selectedProjectId,
  selectedSection,
  selectedFolder,
  onSelectProject,
  onSelectKnowledge,
  onSelectFolder,
  onSelectFile,
}: FolderTreeProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const folderTree = useMemo(() => {
    if (!selectedProject || projectFiles.length === 0) return null;
    return buildFolderTree(projectFiles, selectedProject.path);
  }, [projectFiles, selectedProject]);

  return (
    <div className="p-4 space-y-6">
      <div>
        <div className="text-amber-accent text-xs font-bold tracking-[1.5px] mb-3 px-3">
          PROJECTS
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
                onClick={() => {
                  onSelectProject(project.id);
                  onSelectFolder(null);
                }}
              >
                {isSelected && folderTree ? (
                  <FolderNodes
                    node={folderTree}
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
        <div className="text-amber-accent text-xs font-bold tracking-[1.5px] mb-3 px-3">
          KNOWLEDGE BASE
        </div>
        <TreeNode
          label="All Knowledge"
          icon="📚"
          active={selectedSection === "knowledge"}
          onClick={onSelectKnowledge}
        />
      </div>
    </div>
  );
}
