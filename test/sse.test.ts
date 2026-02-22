import { describe, it, expect, beforeEach } from "vitest";
import type { ServerResponse } from "node:http";
import {
  addSSEClient,
  broadcastUpdate,
  broadcastDiffChanged,
  getConnectionCount,
  closeAllConnections,
} from "../src/server/sse";

function createMockResponse() {
  const chunks: string[] = [];
  let headStatus = 0;
  let headHeaders: Record<string, string> = {};
  let ended = false;
  const closeListeners: Function[] = [];

  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      headStatus = status;
      if (headers) headHeaders = headers;
      return res;
    },
    write(data: string) {
      if (ended) throw new Error("Write after end");
      chunks.push(data);
      return true;
    },
    end() {
      ended = true;
    },
    on(event: string, cb: Function) {
      if (event === "close") closeListeners.push(cb);
      return res;
    },
  } as unknown as ServerResponse;

  return {
    res,
    chunks,
    get status() { return headStatus; },
    get headers() { return headHeaders; },
    get ended() { return ended; },
    simulateClose() {
      closeListeners.forEach((cb) => cb());
    },
  };
}

describe("SSE", () => {
  beforeEach(() => {
    closeAllConnections();
  });

  describe("addSSEClient", () => {
    it("sets correct SSE headers", () => {
      const mock = createMockResponse();
      addSSEClient(mock.res);

      expect(mock.status).toBe(200);
      expect(mock.headers["Content-Type"]).toBe("text/event-stream");
      expect(mock.headers["Cache-Control"]).toBe("no-cache");
      expect(mock.headers["Connection"]).toBe("keep-alive");
    });

    it("sends connected event immediately", () => {
      const mock = createMockResponse();
      addSSEClient(mock.res);

      expect(mock.chunks).toHaveLength(1);
      expect(mock.chunks[0]).toContain("event: connected");
      expect(mock.chunks[0]).toContain('"message":"connected"');
      expect(mock.chunks[0]).toMatch(/\n\n$/);
    });

    it("increments connection count", () => {
      expect(getConnectionCount()).toBe(0);

      const mock1 = createMockResponse();
      addSSEClient(mock1.res);
      expect(getConnectionCount()).toBe(1);

      const mock2 = createMockResponse();
      addSSEClient(mock2.res);
      expect(getConnectionCount()).toBe(2);
    });
  });

  describe("broadcastUpdate", () => {
    it("sends comments-updated event to all clients", () => {
      const mock1 = createMockResponse();
      const mock2 = createMockResponse();
      addSSEClient(mock1.res);
      addSSEClient(mock2.res);

      const reviewData = {
        version: 1 as const,
        round: 1,
        status: "submitted" as const,
        ref: "HEAD",
        metadata: {},
        submittedAt: "2024-01-01T00:00:00.000Z",
        comments: [],
      };
      broadcastUpdate(reviewData);

      for (const mock of [mock1, mock2]) {
        const updateChunk = mock.chunks[1];
        expect(updateChunk).toContain("event: comments-updated");
        expect(updateChunk).toContain('"status":"submitted"');
        expect(updateChunk).toMatch(/\n\n$/);
      }
    });

    it("does not send to disconnected clients", () => {
      const mock1 = createMockResponse();
      const mock2 = createMockResponse();
      addSSEClient(mock1.res);
      addSSEClient(mock2.res);

      mock1.simulateClose();

      const reviewData = {
        version: 1 as const,
        round: 1,
        status: "draft" as const,
        ref: "HEAD",
        metadata: {},
        submittedAt: null,
        comments: [],
      };
      broadcastUpdate(reviewData);

      expect(mock1.chunks).toHaveLength(1);
      expect(mock2.chunks).toHaveLength(2);
    });
  });

  describe("broadcastDiffChanged", () => {
    it("sends diff-changed event to all clients", () => {
      const mock = createMockResponse();
      addSSEClient(mock.res);

      broadcastDiffChanged();

      const diffChunk = mock.chunks[1];
      expect(diffChunk).toContain("event: diff-changed");
      expect(diffChunk).toContain('"message":"diff-changed"');
    });
  });

  describe("dead client cleanup", () => {
    it("removes clients that throw on write", () => {
      const mock1 = createMockResponse();
      const mock2 = createMockResponse();
      addSSEClient(mock1.res);
      addSSEClient(mock2.res);

      expect(getConnectionCount()).toBe(2);

      // Make mock1 throw on next write
      (mock1.res as any).write = () => {
        throw new Error("client gone");
      };

      broadcastDiffChanged();

      expect(getConnectionCount()).toBe(1);
      expect(mock2.chunks).toHaveLength(2);
    });
  });

  describe("closeAllConnections", () => {
    it("ends all responses and clears the set", () => {
      const mock1 = createMockResponse();
      const mock2 = createMockResponse();
      addSSEClient(mock1.res);
      addSSEClient(mock2.res);

      closeAllConnections();

      expect(mock1.ended).toBe(true);
      expect(mock2.ended).toBe(true);
      expect(getConnectionCount()).toBe(0);
    });

    it("handles already-closed connections gracefully", () => {
      const mock = createMockResponse();
      addSSEClient(mock.res);

      (mock.res as any).end = () => {
        throw new Error("already closed");
      };

      expect(() => closeAllConnections()).not.toThrow();
      expect(getConnectionCount()).toBe(0);
    });
  });
});
