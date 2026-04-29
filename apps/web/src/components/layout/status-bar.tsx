"use client";

import { useEffect, useRef, useState } from "react";
import { isSyncEvent, type SyncEvent } from "@/lib/sync-events";
import { SyncPopover, type SyncLogEntry } from "@/components/sync/sync-popover";

type Status = "idle" | "syncing" | "ok" | "error" | "no-remote";

interface StatusBarProps {
  globalRemoteUrl: string | null;
  onSyncAll: () => Promise<void>;
  onUpdateRemote: (url: string) => Promise<void>;
  /** Currently selected project, if any. Enables the "Sync this project" action. */
  selectedProjectName?: string | null;
  onSyncProject?: () => Promise<void>;
}

function formatRelative(ts: number | null): string {
  if (!ts) return "never";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function StatusBar({
  globalRemoteUrl,
  onSyncAll,
  onUpdateRemote,
  selectedProjectName,
  onSyncProject,
}: StatusBarProps) {
  const [status, setStatus] = useState<Status>(globalRemoteUrl ? "idle" : "no-remote");
  const [lastDoneAt, setLastDoneAt] = useState<number | null>(null);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  // The remote URL is fetched async by the parent. Reconcile the initial
  // status when it arrives (or is cleared) so we don't get stuck on the
  // initial render's value. Only flip between idle/no-remote so we don't
  // clobber an in-flight syncing/ok/error status.
  useEffect(() => {
    setStatus((prev) => {
      if (prev === "syncing" || prev === "ok" || prev === "error") return prev;
      return globalRemoteUrl ? "idle" : "no-remote";
    });
  }, [globalRemoteUrl]);

  // Force re-render every 30s so the "2m ago" label stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to the global WS channel. We share the channel with file-watch
  // events but the status bar only cares about sync events.
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    const url = `${protocol}//${window.location.hostname}:${wsPort}`;
    let cancelled = false;
    let reconnect: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (!isSyncEvent(data)) return;
          handleEvent(data);
        } catch {}
      };
      ws.onclose = () => {
        if (!cancelled) reconnect = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnect);
      wsRef.current?.close();
    };
  }, []);

  const handleEvent = (e: SyncEvent) => {
    if (e.type === "sync:start") {
      setStatus("syncing");
      setStage("preparing");
    } else if (e.type === "sync:stage") {
      setStage(e.stage);
    } else if (e.type === "sync:done") {
      setStatus("ok");
      setStage(null);
      setLastDoneAt(e.at);
      setLog((prev) => [{ projectId: e.projectId, result: "ok" as const, at: e.at }, ...prev].slice(0, 50));
    } else if (e.type === "sync:error") {
      setStatus("error");
      setStage(null);
      setLog((prev) => [{ projectId: e.projectId, result: "error" as const, at: e.at, message: e.message }, ...prev].slice(0, 50));
    }
  };

  const dotColor =
    status === "ok" ? "var(--success)"
    : status === "syncing" ? "var(--warning)"
    : status === "error" ? "var(--danger)"
    : "var(--text-secondary)";

  const label =
    status === "syncing" ? "syncing..."
    : status === "error" ? "sync failed"
    : status === "no-remote" ? "no remote configured"
    : status === "ok" ? `synced ${formatRelative(lastDoneAt)}`
    : lastDoneAt ? `synced ${formatRelative(lastDoneAt)}` : "idle";

  const remoteLabel = globalRemoteUrl
    ? globalRemoteUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")
    : null;

  return (
    <footer className="relative h-7 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 flex items-center gap-2.5 text-[12px] text-[var(--text-secondary)] font-mono">
      <span style={{ color: dotColor }} className={status === "syncing" ? "animate-pulse" : ""}>
        ●
      </span>
      <span>{label}</span>
      <span className="text-[var(--border)]">·</span>
      <span className={status === "syncing" ? "text-[var(--warning)]" : ""}>
        git: {status === "syncing" ? (stage || "working") : "clean"}
      </span>
      {remoteLabel && (
        <>
          <span className="text-[var(--border)]">·</span>
          <span className="truncate max-w-[260px]">{remoteLabel}</span>
        </>
      )}
      {selectedProjectName && onSyncProject && (
        <button
          onClick={async () => {
            // Optimistic: flip the bar to "syncing" right away so the user
            // sees feedback even if the WS event takes a moment (or never
            // arrives in cases where the channel is down). The real
            // sync:start / sync:stage events will overwrite this within
            // milliseconds when the channel is healthy.
            setStatus("syncing");
            setStage("preparing");
            try {
              await onSyncProject();
            } catch {
              // Errors flow through the WS sync:error event; if WS is
              // down, also reset locally so the bar isn't stuck.
              setStatus(globalRemoteUrl ? "idle" : "no-remote");
              setStage(null);
            }
          }}
          disabled={status === "syncing"}
          className="ml-auto px-2 py-0.5 rounded bg-[var(--accent)] text-black font-bold hover:opacity-90 disabled:opacity-50 truncate max-w-[180px]"
          title={`Sync ${selectedProjectName}`}
        >
          Sync {selectedProjectName}
        </button>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${selectedProjectName && onSyncProject ? "" : "ml-auto"} px-2 py-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)]`}
        title="Open sync menu"
      >
        Sync ▾
      </button>
      <SyncPopover
        open={open}
        onClose={() => setOpen(false)}
        log={log}
        globalRemoteUrl={globalRemoteUrl}
        onSyncAll={onSyncAll}
        onUpdateRemote={onUpdateRemote}
        selectedProjectName={selectedProjectName ?? null}
        onSyncProject={onSyncProject}
      />
    </footer>
  );
}
