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
  projectBasePath: string;
  knowledgeBasePath: string;
  onSelectProject: (projectId: number) => void;
  onSelectKnowledge: () => void;
  onSelectKnowledgeFolder: (folderPath: string | null) => void;
  onSelectFolder: (folderPath: string | null) => void;
  onSelectFile: (fileId: number) => void;
  onCreateFolder: (projectId: number) => void;
}

const FileIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

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
          icon={<FileIcon className="w-3.5 h-3.5 text-amber-accent" />}
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
  projectBasePath,
  knowledgeBasePath,
  onSelectProject,
  onSelectKnowledge,
  onSelectKnowledgeFolder,
  onSelectFolder,
  onSelectFile,
  onCreateFolder,
}: FolderTreeProps) {
  // Tree for Projects
  const projectFolderTree = useMemo(() => {
    if (!selectedProjectId) return null;
    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    if (!selectedProject || !selectedProject.path) return null;
    return buildFolderTree(projectFiles, selectedProject.path, projectFolders);
  }, [selectedProjectId, projectFiles, projectFolders, projects]);

  // Tree for Knowledge Base
  const knowledgeFolderTree = useMemo(() => {
    if (knowledgeFolders.length === 0 && knowledgeFiles.length === 0) return null;
    return buildFolderTree(knowledgeFiles, knowledgeBasePath, knowledgeFolders);
  }, [knowledgeFiles, knowledgeFolders, knowledgeBasePath]);

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
          <div 
            onClick={onSelectKnowledge}
            className={`text-xs font-bold tracking-[1.5px] cursor-pointer hover:text-amber-accent-dark transition-colors ${selectedSection === "knowledge" && !selectedFolder ? "text-amber-accent" : "text-amber-accent/70"}`}
          >
            KNOWLEDGE BASE
          </div>
          <button
            onClick={() => onCreateFolder(0)}
            className="text-[10px] font-bold text-gray-500 hover:text-amber-accent transition-colors"
          >
            + FOLDER
          </button>
        </div>
        <div className="space-y-1">
          {knowledgeFolderTree ? (
            <FolderNodes
              node={knowledgeFolderTree}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectKnowledgeFolder}
              onSelectFile={onSelectFile}
            />
          ) : (
            <div className="flex flex-col items-center py-6 text-gray-400 gap-2">
              <span className="text-3xl opacity-30">📂</span>
              <p className="text-xs font-medium">No folders yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
