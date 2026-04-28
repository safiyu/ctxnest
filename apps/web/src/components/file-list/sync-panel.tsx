"use client";

import { useState } from "react";
import { GitWizardModal } from "./git-wizard-modal";

interface SyncPanelProps {
  remoteUrl: string | null;
  onSync?: () => Promise<void>;
  onSyncAll: () => Promise<void>;
  onUpdateRemote: (url: string) => Promise<void>;
}

export function SyncPanel({
  remoteUrl,
  onSync,
  onSyncAll,
  onUpdateRemote,
}: SyncPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSave = async (finalUrl: string) => {
    await onUpdateRemote(finalUrl);
  };

  const handleSync = async () => {
    setSyncing(true);
    setStatus("idle");
    try {
      if (onSync) {
        await onSync();
      }
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      console.error("Sync failed:", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAllClick = async () => {
    setSyncing(true);
    setStatus("idle");
    try {
      await onSyncAll();
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      console.error("Sync All failed:", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    } finally {
      setSyncing(false);
    }
  };

  // Helper to obscure credentials in the UI
  const getDisplayUrl = (rawUrl: string | null) => {
    if (!rawUrl) return "";
    return rawUrl.replace(/\/\/[^@]+@/, "//***@");
  };

  return (
    <>
      <div className="px-4 py-3 bg-amber-accent/5 border-b border-amber-accent/10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-gray-800 dark:text-amber-accent tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-accent animate-pulse" />
            GLOBAL VAULT
          </div>
          {remoteUrl && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                {onSync && (
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`px-3 py-1 bg-amber-accent text-black text-[10px] font-bold rounded flex items-center gap-1.5 hover:bg-amber-accent-dark transition-colors disabled:opacity-50 ${
                      syncing ? "animate-pulse" : ""
                    }`}
                  >
                    {syncing ? "SYNCING..." : "SYNC PROJECT"}
                  </button>
                )}
                <button
                  onClick={handleSyncAllClick}
                  disabled={syncing}
                  className={`px-3 py-1 border border-amber-accent text-amber-accent text-[10px] font-bold rounded flex items-center gap-1.5 hover:bg-amber-accent/10 transition-colors disabled:opacity-50 ${
                    syncing ? "animate-pulse" : ""
                  }`}
                >
                  {syncing ? "SYNCING ALL..." : "SYNC ALL"}
                </button>
              </div>
              {status === "success" && (
                <span className="text-[9px] text-green-500 font-bold animate-fade-in">✓ SYNCED</span>
              )}
              {status === "error" && (
                <span className="text-[9px] text-red-500 font-bold animate-fade-in">⚠ FAILED</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center justify-between">
            {remoteUrl ? (
              <div className="flex-1 text-[11px] text-gray-700 dark:text-gray-300 truncate pr-4" title={getDisplayUrl(remoteUrl)}>
                {getDisplayUrl(remoteUrl)}
              </div>
            ) : (
              <div className="flex-1 text-[11px] text-gray-500 italic">
                No remote repository configured.
              </div>
            )}
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] font-bold text-gray-500 hover:text-amber-accent transition-colors shrink-0"
            >
              {remoteUrl ? "EDIT CONFIG" : "CONFIGURE GIT"}
            </button>
          </div>
        </div>
      </div>

      <GitWizardModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        onSave={handleSave}
        currentUrl={remoteUrl}
      />
    </>
  );
}

