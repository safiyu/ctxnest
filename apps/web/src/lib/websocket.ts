import { WebSocketServer, type WebSocket } from "ws";
import { createFileWatcher, type WatcherEvent } from "@ctxnest/core";
import type { SyncEvent } from "./sync-events";

// globalThis-cached so Next.js module duplication doesn't split the
// open-sockets Set across instances (broadcast would silently no-op).
declare global {
  // eslint-disable-next-line no-var
  var __ctxnestWss: WebSocketServer | null | undefined;
  // eslint-disable-next-line no-var
  var __ctxnestWsClients: Set<WebSocket> | undefined;
}

let wss: WebSocketServer | null = globalThis.__ctxnestWss ?? null;
const clients: Set<WebSocket> = (globalThis.__ctxnestWsClients ??= new Set());

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function startWebSocketServer(port: number, watchPaths: string[]) {
  if (wss) return wss;
  const host = process.env.CTXNEST_WS_HOST || "127.0.0.1";
  const loopback = isLoopbackHost(host);

  // Non-loopback WS leaks absolute paths + project metadata. Require
  // origin allowlist and/or shared-secret token in that case.
  const allowedOrigins = (process.env.CTXNEST_WS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const requiredToken = (process.env.CTXNEST_WS_TOKEN || "").trim();

  if (!loopback && allowedOrigins.length === 0 && !requiredToken) {
    console.warn(
      `[CtxNest] WS bound to ${host} (non-loopback) WITHOUT auth. ` +
        "All connections will be rejected. Set CTXNEST_WS_ORIGINS " +
        "(comma-separated allowed Origin headers) and/or CTXNEST_WS_TOKEN " +
        "(shared secret query param) to enable network access."
    );
  }

  wss = new WebSocketServer({ port, host });
  globalThis.__ctxnestWss = wss;

  wss.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.warn(`[CtxNest] WebSocket server port ${port} is already in use. Fast refresh detected.`);
    } else {
      console.error("[CtxNest] WebSocket server error:", e);
    }
  });

  wss.on("connection", (ws, req) => {
    if (!loopback) {
      if (allowedOrigins.length === 0 && !requiredToken) {
        ws.close(1008, "WS auth not configured");
        return;
      }
      if (allowedOrigins.length > 0) {
        const origin = req.headers.origin;
        if (!origin || !allowedOrigins.includes(origin)) {
          ws.close(1008, "Origin not allowed");
          return;
        }
      }
      if (requiredToken) {
        let supplied: string | null = null;
        try {
          const u = new URL(req.url || "/", "http://_");
          supplied = u.searchParams.get("token");
        } catch {}
        if (supplied !== requiredToken) {
          ws.close(1008, "Invalid token");
          return;
        }
      }
    }
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
