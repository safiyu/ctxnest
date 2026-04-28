"use client";

import { useState } from "react";

interface SyncPanelProps {
  projectId: number;
  remoteUrl: string | null;
  onSync: () => Promise<void>;
  onUpdateRemote: (url: string) => Promise<void>;
}

export function SyncPanel({
  projectId,
  remoteUrl,
  onSync,
  onUpdateRemote,
}: SyncPanelProps) {
  const [url, setUrl] = useState(remoteUrl || "");
  const [isEditing, setIsEditing] = useState(!remoteUrl);
  const [syncing, setSyncing] = useState(false);

  const handleSave = async () => {
    await onUpdateRemote(url);
    setIsEditing(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="px-4 py-3 bg-amber-accent/5 border-b border-amber-accent/10 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold text-amber-accent tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-accent animate-pulse" />
          COLLABORATION
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`px-3 py-1 bg-amber-accent text-black text-[10px] font-bold rounded flex items-center gap-1.5 hover:bg-amber-accent-dark transition-colors disabled:opacity-50 ${
            syncing ? "animate-pulse" : ""
          }`}
        >
          {syncing ? "SYNCING..." : "SYNC NOW"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter remote Git URL..."
              className="flex-1 bg-black/20 border border-amber-accent/20 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-amber-accent/50"
            />
            <button
              onClick={handleSave}
              className="text-[11px] font-bold text-amber-accent hover:text-white"
            >
              SAVE
            </button>
          </>
        ) : (
          <>
            <div className="flex-1 text-[11px] text-gray-400 truncate">
              {remoteUrl}
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] font-bold text-gray-500 hover:text-amber-accent"
            >
              EDIT
            </button>
          </>
        )}
      </div>
    </div>
  );
}
