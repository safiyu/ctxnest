"use client";

import { useState } from "react";

interface NewFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function NewFolderDialog({ open, onClose, onCreate }: NewFolderDialogProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onCreate(name);
      setName("");
      onClose();
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="w-[400px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-2xl overflow-hidden animate-fade-in">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
            <h3 className="text-lg font-bold text-amber-accent">CREATE NEW FOLDER</h3>
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
          </div>

          <div className="p-6">
            <label className="block text-[10px] font-bold text-gray-500 tracking-widest mb-1.5">FOLDER NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. documentation"
              className="w-full bg-black/20 border border-[var(--border-color)] rounded px-3 py-2 text-sm text-white outline-none focus:border-amber-accent/50"
              autoFocus
              required
            />
            <p className="text-[10px] text-gray-500 mt-2 italic">
              Folder will be created in the project root.
            </p>
          </div>

          <div className="px-6 py-4 bg-black/10 border-t border-[var(--border-color)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-6 py-2 bg-amber-accent text-black text-xs font-bold rounded hover:bg-amber-accent-dark transition-colors disabled:opacity-50"
            >
              {loading ? "CREATING..." : "CREATE FOLDER"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
