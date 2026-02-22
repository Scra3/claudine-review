import type { ServerResponse } from "node:http";
import type { ReviewData } from "../shared/types.js";

const connections = new Set<ServerResponse>();

export function addSSEClient(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: "connected" })}\n\n`);

  connections.add(res);

  res.on("close", () => {
    connections.delete(res);
  });
}

export function broadcastUpdate(data: ReviewData): void {
  const payload = `event: comments-updated\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch {
      connections.delete(res);
    }
  }
}

export function broadcastDiffChanged(): void {
  const payload = `event: diff-changed\ndata: ${JSON.stringify({ message: "diff-changed" })}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch {
      connections.delete(res);
    }
  }
}

export function getConnectionCount(): number {
  return connections.size;
}

export function closeAllConnections(): void {
  for (const res of connections) {
    try {
      res.end();
    } catch { /* ignore */ }
  }
  connections.clear();
}
