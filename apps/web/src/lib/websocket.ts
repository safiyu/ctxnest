import { WebSocketServer, type WebSocket } from "ws";
import { createFileWatcher, type WatcherEvent } from "@ctxnest/core";
import type { SyncEvent } from "./sync-events";

// Pin WS state on globalThis so Next.js module duplication (dev bundling
// per-route, plus instrumentation hook running in its own module instance)
// doesn't end up with one instance holding the live sockets and another
// trying to broadcast into an empty Set. Same pattern as the SQLite
// singleton in @ctxnest/core.
declare global {
  // eslint-disable-next-line no-var
  var __ctxnestWss: WebSocketServer | null | undefined;
  // eslint-disable-next-line no-var
  var __ctxnestWsClients: Set<WebSocket> | undefined;
}

let wss: WebSocketServer | null = globalThis.__ctxnestWss ?? null;
const clients: Set<WebSocket> = (globalThis.__ctxnestWsClients ??= new Set());

export function startWebSocketServer(port: number, watchPaths: string[]) {
  if (wss) return wss;
  const host = process.env.CTXNEST_WS_HOST || "127.0.0.1";
  wss = new WebSocketServer({ port, host });
  globalThis.__ctxnestWss = wss;

  wss.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.warn(`[CtxNest] WebSocket server port ${port} is already in use. Fast refresh detected.`);
    } else {
      console.error("[CtxNest] WebSocket server error:", e);
    }
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  createFileWatcher(watchPaths, (event: WatcherEvent) => {
    broadcast(event);
  });

  return wss;
}

function broadcast(payload: unknown) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) client.send(message);
  }
}

export function broadcastSync(event: SyncEvent): void {
  broadcast(event);
}
