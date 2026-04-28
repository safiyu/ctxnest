"use client";

import { useState } from "react";
import { GitWizardModal } from "./git-wizard-modal";
import { UnregisterModal } from "./unregister-modal";

interface SyncPanelProps {
  remoteUrl: string | null;
  projectName?: string;
  onSync?: () => Promise<void>;
  onUnregister?: () => Promise<void>;
  onSyncAll: () => Promise<void>;
  onUpdateRemote: (url: string) => Promise<void>;
}

export function SyncPanel({
  remoteUrl,
  projectName,
  onSync,
  onUnregister,
  onSyncAll,
  onUpdateRemote,
}: SyncPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
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

  const handleUnregisterConfirm = async () => {
    if (onUnregister) {
      await onUnregister();
      setIsUnregistering(false);
    }
  };

  // Helper to obscure credentials in the UI
  const getDisplayUrl = (rawUrl: string | null) => {
    if (!rawUrl) return "";
    return rawUrl.replace(/\/\/[^@]+@/, "//***@");
  };

  return (
    <>
      <div className="px-5 py-4 bg-[#0F172A]/40 backdrop-blur-md border-b border-[#1E293B] shadow-inner">
        {/* Header Row: Status and Config */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${remoteUrl ? 'bg-amber-accent/10 border-amber-accent/30' : 'bg-slate-800/50 border-slate-700'}`}>
              <span className={`text-xl ${syncing ? 'animate-spin-slow' : ''}`}>
                {status === "error" ? "❌" : status === "success" ? "✅" : "🛡️"}
              </span>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] font-black text-amber-accent tracking-[2px] uppercase flex items-center gap-2">
                Global Vault
                {syncing && <span className="w-1.5 h-1.5 rounded-full bg-amber-accent animate-ping" />}
              </div>
              <div className="text-[11px] text-slate-400 font-medium truncate max-w-[150px] mt-0.5" title={remoteUrl || "No remote"}>
                {remoteUrl ? getDisplayUrl(remoteUrl) : "Local Storage Mode"}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsEditing(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 hover:text-amber-accent hover:bg-slate-700/50 transition-all border border-slate-700/50"
            title="Configure Git"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>

        {/* Actions Grid */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSyncAllClick}
            disabled={syncing}
            className="w-full py-2.5 bg-amber-accent text-black text-[11px] font-black rounded-lg flex items-center justify-center gap-2 hover:bg-amber-accent-dark transition-all disabled:opacity-50 shadow-lg shadow-amber-950/20 uppercase tracking-wider"
          >
            {syncing ? "Initiating Global Sync..." : "Sync All Projects"}
          </button>
          
          {onSync && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="py-2 bg-slate-800 text-slate-200 text-[10px] font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 uppercase"
              >
                <span>🔄</span>
                {syncing ? "Syncing..." : "Sync Project"}
              </button>
              {onUnregister && (
                <button
                  onClick={() => setIsUnregistering(true)}
                  disabled={syncing}
                  className="py-2 bg-red-950/20 text-red-400 text-[10px] font-bold rounded-lg border border-red-900/30 hover:bg-red-900/40 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 uppercase"
                >
                  <span>🚫</span>
                  Unregister
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Simple Status Message */}
        {status !== "idle" && (
          <div className={`mt-3 text-center text-[10px] font-bold uppercase tracking-widest animate-fade-in ${status === "success" ? "text-green-500" : "text-red-500"}`}>
            {status === "success" ? "Vault successfully synchronized" : "Synchronization failed - check console"}
          </div>
        )}
      </div>

      <UnregisterModal
        isOpen={isUnregistering}
        onClose={() => setIsUnregistering(false)}
        onConfirm={handleUnregisterConfirm}
        projectName={projectName || "this project"}
      />

      <GitWizardModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        onSave={handleSave}
        currentUrl={remoteUrl}
      />
    </>
  );
}

