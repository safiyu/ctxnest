"use client";

import { useState, useEffect } from "react";
import { MarkdownViewer } from "./markdown-viewer";
import { MarkdownEditor } from "./markdown-editor";

interface File {
  id: number;
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

interface ContentPaneProps {
  fileId: number | null;
}

export function ContentPane({ fileId }: ContentPaneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [viewSource, setViewSource] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fileId === null) {
      setFile(null);
      setEditing(false);
      setViewSource(false);
      return;
    }

    const fetchFile = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/files/${fileId}`);
        if (response.ok) {
          const data = await response.json();
          setFile(data);
          setEditContent(data.content);
        }
      } catch (error) {
        console.error("Failed to fetch file:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFile();
  }, [fileId]);

  const handleEdit = () => {
    setEditing(true);
    setEditContent(file?.content || "");
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent(file?.content || "");
  };

  const handleSave = async () => {
    if (!file) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/files/${file.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: editContent,
        }),
      });

      if (response.ok) {
        const updatedFile = await response.json();
        setFile(updatedFile);
        setEditing(false);
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!fileId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3 animate-fade-in">
        <span className="text-5xl opacity-30">📂</span>
        <div className="text-center">
          <p className="text-base font-medium">Select a file to preview</p>
          <p className="text-sm text-gray-500 mt-1">Choose a file from the list on the left</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col animate-fade-in">
        <div className="border-b border-gray-200 dark:border-[#333333] px-6 py-4">
          <div className="skeleton h-6 w-48 mb-2" />
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-4/6" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3 animate-fade-in">
        <span className="text-5xl opacity-30">🔍</span>
        <div className="text-center">
          <p className="text-base font-medium">File not found</p>
          <p className="text-sm text-gray-500 mt-1">This file may have been moved or deleted</p>
        </div>
      </div>
    );
  }

  return (
    <div key={fileId} className="h-full flex flex-col animate-fade-in">
      <div className="border-b border-gray-200 dark:border-[#333333] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {file.title}
            </h2>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {file.storage_type.toUpperCase()} •{" "}
              {new Date(file.updated_at).toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 text-sm bg-amber-accent text-black rounded hover:bg-amber-accent-dark transition-colors btn-press"
                >
                  Edit
                </button>
                <button
                  onClick={() => setViewSource(!viewSource)}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-[#333333] transition-colors btn-press"
                >
                  {viewSource ? "View" : "Source"}
                </button>
              </>
            )}

            {editing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-amber-accent text-black rounded hover:bg-amber-accent-dark transition-colors disabled:opacity-50 btn-press"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-[#333333] transition-colors disabled:opacity-50 btn-press"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {editing ? (
          <MarkdownEditor content={editContent} onChange={setEditContent} />
        ) : viewSource ? (
          <pre className="p-6 text-sm overflow-auto h-full bg-gray-50 dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100">
            {file.content}
          </pre>
        ) : (
          <div className="h-full overflow-auto">
            <MarkdownViewer content={file.content} />
          </div>
        )}
      </div>
    </div>
  );
}
