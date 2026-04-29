"use client";

import { useState, useEffect } from "react";
import { MarkdownViewer } from "./markdown-viewer";
import { MarkdownEditor } from "./markdown-editor";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

interface File {
  id: number;
  project_id: number | null;
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
  onDelete: (id: number) => Promise<void>;
}

export function ContentPane({ fileId, onDelete }: ContentPaneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewHistory, setViewHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [viewSource, setViewSource] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (fileId === null) {
      setFile(null);
      setEditing(false);
      setViewSource(false);
      setViewHistory(false);
      return;
    }

    const fetchFile = async () => {
      setLoading(true);
      try {
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
    setViewHistory(false);
  }, [fileId]);

  const fetchHistory = async () => {
    if (!fileId) return;
    setFetchingHistory(true);
    try {
      const response = await fetch(`/api/files/${fileId}/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setFetchingHistory(false);
    }
  };

  const handleRestore = async (hash: string) => {
    if (!fileId) return;
    try {
      const response = await fetch(`/api/files/${fileId}/history/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      if (response.ok) {
        const data = await response.json();
        setFile((prev) => prev ? { ...prev, content: data.content } : null);
        setEditContent(data.content);
        setViewHistory(false);
      }
    } catch (error) {
      console.error("Failed to restore version:", error);
    }
  };

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

  const handleDeleteConfirm = async () => {
    if (!file) return;
    setDeleting(true);
    try {
      await onDelete(file.id);
      setFile(null);
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!fileId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#475569] dark:text-[#94A3B8] gap-3 animate-fade-in">
        <span className="text-6xl opacity-40 dark-icon">📂</span>
        <div className="text-center">
          <p className="text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9]">Select a file to preview</p>
          <p className="text-sm font-medium text-[#475569] dark:text-[#94A3B8] mt-2">Choose a file from the list on the left</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col animate-fade-in">
        <div className="border-b border-[var(--border)] px-6 py-4">
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
      <div className="h-full flex flex-col items-center justify-center text-[#475569] dark:text-[#94A3B8] gap-3 animate-fade-in">
        <span className="text-6xl opacity-40 dark-icon">🔍</span>
        <div className="text-center">
          <p className="text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9]">File not found</p>
          <p className="text-sm font-medium text-[#475569] dark:text-[#94A3B8] mt-2">This file may have been moved or deleted</p>
        </div>
      </div>
    );
  }

  return (
    <div key={fileId} className="h-full flex flex-col animate-fade-in">
      <div className="h-10 px-4 border-b border-[var(--border)] flex items-center gap-4 text-[14px] sticky top-0 bg-[var(--bg-primary)] z-10">
        {(["view", "edit", "source", "history"] as const).map((mode) => {
          const active =
            (mode === "view" && !editing && !viewSource && !viewHistory) ||
            (mode === "edit" && editing) ||
            (mode === "source" && viewSource) ||
            (mode === "history" && viewHistory);
          const onTabClick = () => {
            if (mode === "edit") {
              if (!editing) handleEdit();
              return;
            }
            // Switching away from edit cancels in-progress edits.
            if (editing) handleCancel();
            setViewSource(mode === "source");
            setViewHistory(mode === "history");
            if (mode === "history") fetchHistory();
          };
          return (
            <button
              key={mode}
              onClick={onTabClick}
              className={`-mb-px py-2 border-b-2 transition-colors ${
                active
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-[var(--text-secondary)] font-mono">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2 py-1 bg-[var(--accent)] text-black font-bold rounded disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {file?.updated_at && <span>edited {formatRelative(file.updated_at)}</span>}
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="hover:text-[var(--danger)]"
                aria-label="Delete file"
                title="Delete file"
              >
                ⋯
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {editing ? (
          <MarkdownEditor content={editContent} onChange={setEditContent} />
        ) : viewHistory ? (
          <div className="h-full overflow-auto bg-gray-50 dark:bg-[#0a0a0a] p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-6">
                Version History (Time Travel)
              </h3>
              {fetchingHistory ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No version history found for this file.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((commit) => (
                    <div 
                      key={commit.hash}
                      className="bg-white dark:bg-[#1a1a1a] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between hover:border-amber-accent/50 transition-colors shadow-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {commit.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-secondary)] uppercase tracking-tighter font-bold">
                          <span>{new Date(commit.date).toLocaleString()}</span>
                          <span className="opacity-30">•</span>
                          <span className="font-mono text-amber-accent">{commit.hash.substring(0, 7)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(commit.hash)}
                        className="ml-4 px-4 py-2 bg-gray-100 dark:bg-[#252525] text-xs font-bold rounded hover:bg-amber-accent hover:text-black transition-all btn-press border border-[var(--border)]"
                      >
                        RESTORE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        title={file.title}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </div>
  );
}

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!isFinite(ts)) return iso;
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
