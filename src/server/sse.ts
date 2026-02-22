import type { ServerResponse } from "node:http";
import type { ReviewData } from "../shared/types.js";

const connections = new Set<ServerResponse>();

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch (err) {
      console.warn(`SSE client disconnected (removing): ${err}`);
      connections.delete(res);
    }
  }
}

export function addSSEClient(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ message: "connected" })}\n\n`);

  connections.add(res);

  res.on("close", () => {
    connections.delete(res);
  });
}

export function broadcastUpdate(data: ReviewData): void {
  broadcast("comments-updated", data);
}

export function broadcastDiffChanged(): void {
  broadcast("diff-changed", { message: "diff-changed" });
}

export function getConnectionCount(): number {
  return connections.size;
}

export function closeAllConnections(): void {
  for (const res of connections) {
    try {
      res.end();
    } catch { /* shutdown cleanup — acceptable to ignore */ }
  }
  connections.clear();
}
