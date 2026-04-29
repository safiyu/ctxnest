"use client";
import { useEffect, useRef } from "react";

export function useWebSocket(onEvent: (event: { type: string; path: string }) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    const wsToken = process.env.NEXT_PUBLIC_WS_TOKEN || "";
    const tokenSuffix = wsToken ? `?token=${encodeURIComponent(wsToken)}` : "";
    const wsUrl = `${protocol}//${window.location.hostname}:${wsPort}${tokenSuffix}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const detach = (socket: WebSocket | null) => {
      if (!socket) return;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    };

    const connect = () => {
      if (cancelled) return;
      // Tear down any previous socket so a stale close can't double-reconnect.
      if (ws) {
        detach(ws);
        try { ws.close(); } catch {}
        ws = null;
      }
      ws = new WebSocket(wsUrl);
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          onEventRef.current(event);
        } catch {}
      };
      ws.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
      // onerror is always followed by onclose; closing here would leak a socket.
      ws.onerror = () => {};
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      detach(ws);
      try { ws?.close(); } catch {}
      ws = null;
    };
  }, []);
}
