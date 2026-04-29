"use client";
import { useEffect, useRef } from "react";

export function useWebSocket(onEvent: (event: { type: string; path: string }) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // NEXT_PUBLIC_WS_PORT is baked at build time; falls back to 3001.
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    const wsUrl = `${protocol}//${window.location.hostname}:${wsPort}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          onEventRef.current(event);
        } catch {}
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
