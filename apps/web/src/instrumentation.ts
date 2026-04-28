export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebSocketServer } = await import("./lib/websocket");
    const path = await import("node:path");

    const dataDir = process.env.CTXNEST_DATA_DIR || path.join(process.cwd(), "../../data");

    startWebSocketServer(3001, [dataDir]);

    console.log("[CtxNest] WebSocket server started on :3001");
  }
}
