import { WebSocketServer, type WebSocket } from "ws";
import { createFileWatcher, type WatcherEvent } from "@ctxnest/core";
import type { SyncEvent } from "./sync-events";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function startWebSocketServer(port: number, watchPaths: string[]) {
  if (wss) return wss;
  const host = process.env.CTXNEST_WS_HOST || "127.0.0.1";
  wss = new WebSocketServer({ port, host });

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
