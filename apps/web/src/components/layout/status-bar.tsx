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

  // Reconcile when globalRemoteUrl arrives async; preserve in-flight statuses.
  useEffect(() => {
    setStatus((prev) => {
      if (prev === "syncing" || prev === "ok" || prev === "error") return prev;
      return globalRemoteUrl ? "idle" : "no-remote";
    });
  }, [globalRemoteUrl]);

  // Tick every 30s so "synced 2m ago" stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    const wsToken = process.env.NEXT_PUBLIC_WS_TOKEN || "";
    const tokenSuffix = wsToken ? `?token=${encodeURIComponent(wsToken)}` : "";
    const url = `${protocol}//${window.location.hostname}:${wsPort}${tokenSuffix}`;
    let cancelled = false;
    let reconnect: ReturnType<typeof setTimeout> | null = null;

    const detach = (socket: WebSocket | null) => {
      if (!socket) return;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    };

    const connect = () => {
      if (cancelled) return;
      if (wsRef.current) {
        detach(wsRef.current);
        try { wsRef.current.close(); } catch {}
      }
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
        if (cancelled) return;
        reconnect = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnect) clearTimeout(reconnect);
      detach(wsRef.current);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
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
    : lastDoneAt ? `synced ${formatRelative(lastDoneAt)}` : "ready";

  const remoteLabel = globalRemoteUrl
    ? globalRemoteUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")
    : null;

  return (
    <footer className="relative h-7 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 flex items-center gap-2.5 text-[13px] text-[var(--text-secondary)] font-mono">
      <span style={{ color: dotColor }} className={status === "syncing" ? "animate-pulse" : ""}>
        ●
      </span>
      <span>{label}</span>
      <span className="text-[var(--border)]">·</span>
      <span className={`font-medium ${status === "syncing" ? "text-[var(--warning)]" : ""}`}>
        git: {status === "syncing" ? (stage || "working") : "clean"}
      </span>
      {remoteLabel && (
        <>
          <span className="text-[var(--border)]">·</span>
          <span className="truncate max-w-[260px] opacity-70">{remoteLabel}</span>
        </>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-auto px-2 py-0.5 rounded text-[var(--accent)] hover:bg-[var(--bg-tertiary)] font-bold uppercase tracking-wider"
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
