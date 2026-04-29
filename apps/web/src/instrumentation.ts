export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebSocketServer } = await import("./lib/websocket");
    const path = await import("node:path");

    const dataDir = process.env.CTXNEST_DATA_DIR || path.join(process.cwd(), "../../data");
    const wsPort = Number(process.env.WS_PORT) || 3001;

    startWebSocketServer(wsPort, [dataDir]);

    console.log(`[CtxNest] WebSocket server started on :${wsPort}`);
  }
}
