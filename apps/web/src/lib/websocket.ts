import { WebSocketServer, type WebSocket } from "ws";
import { createFileWatcher, type WatcherEvent } from "@ctxnest/core";

let wss: WebSocketServer | null = null;

export function startWebSocketServer(port: number, watchPaths: string[]) {
  if (wss) return wss;
  wss = new WebSocketServer({ port });
  
  wss.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.warn(`[CtxNest] WebSocket server port ${port} is already in use. Fast refresh detected.`);
    } else {
      console.error("[CtxNest] WebSocket server error:", e);
    }
  });

  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });
  createFileWatcher(watchPaths, (event: WatcherEvent) => {
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === 1) client.send(message);
    }
  });
  return wss;
}
