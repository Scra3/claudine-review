import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { getDiff, getFileContent } from "./git.js";
import { ReviewStore } from "./store.js";
import { addSSEClient, broadcastUpdate } from "./sse.js";
import {
  AddCommentSchema,
  UpdateCommentSchema,
  SummarySchema,
} from "../shared/types.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ApiContext {
  store: ReviewStore;
  repoRoot: string;
  ref: string;
  token: string;
  port: number;
}

function parseUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
}

async function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalSize += buf.length;
    if (totalSize > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function checkToken(url: URL, ctx: ApiContext, res: ServerResponse): boolean {
  const t = url.searchParams.get("token") ?? "";
  const expected = ctx.token;
  if (
    t.length !== expected.length ||
    !timingSafeEqual(Buffer.from(t), Buffer.from(expected))
  ) {
    error(res, "Unauthorized", 401);
    return false;
  }
  return true;
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<boolean> {
  const url = parseUrl(req);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path.startsWith("/api/") || path === "/sse") {
    const origin = `http://127.0.0.1:${ctx.port}`;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
  }

  if (path === "/sse" && method === "GET") {
    if (!checkToken(url, ctx, res)) return true;
    addSSEClient(res);
    return true;
  }

  if (!path.startsWith("/api/")) return false;

  if (!checkToken(url, ctx, res)) return true;

  // GET /api/diff
  if (path === "/api/diff" && method === "GET") {
    const ref = url.searchParams.get("ref") ?? ctx.ref;
    try {
      const diff = getDiff(ctx.repoRoot, ref);
      json(res, diff);
    } catch (err) {
      error(res, `Failed to get diff: ${errorMessage(err)}`, 500);
    }
    return true;
  }

  // GET /api/file
  if (path === "/api/file" && method === "GET") {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      error(res, "Missing 'path' parameter");
      return true;
    }
    try {
      const content = getFileContent(ctx.repoRoot, filePath);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("traversal")) {
        error(res, "Path traversal detected", 403);
      } else {
        error(res, `File not found: ${filePath}`, 404);
      }
    }
    return true;
  }

  // GET /api/comments
  if (path === "/api/comments" && method === "GET") {
    json(res, ctx.store.getData());
    return true;
  }

  // POST /api/comments — add a single comment
  if (path === "/api/comments" && method === "POST") {
    let parsed;
    try {
      const body = await readBody(req);
      parsed = AddCommentSchema.parse(JSON.parse(body));
    } catch (err) {
      error(res, `Invalid request: ${errorMessage(err)}`);
      return true;
    }
    try {
      const updated = ctx.store.addComment(parsed);
      broadcastUpdate(updated);
      json(res, updated, 201);
    } catch (err) {
      error(res, `Server error: ${errorMessage(err)}`, 500);
    }
    return true;
  }

  // POST /api/summary
  if (path === "/api/summary" && method === "POST") {
    let parsed;
    try {
      const body = await readBody(req);
      parsed = SummarySchema.parse(JSON.parse(body));
    } catch (err) {
      error(res, `Invalid request: ${errorMessage(err)}`);
      return true;
    }
    try {
      const updated = ctx.store.setSummary(parsed);
      broadcastUpdate(updated);
      json(res, updated, 201);
    } catch (err) {
      error(res, `Server error: ${errorMessage(err)}`, 500);
    }
    return true;
  }

  // PATCH|DELETE /api/comments/:id
  const commentIdMatch = path.match(/^\/api\/comments\/([a-zA-Z0-9_-]+)$/);
  if (commentIdMatch) {
    const commentId = commentIdMatch[1];

    if (method === "PATCH") {
      let patch;
      try {
        const body = await readBody(req);
        patch = UpdateCommentSchema.parse(JSON.parse(body));
      } catch (err) {
        error(res, `Invalid request: ${errorMessage(err)}`);
        return true;
      }
      try {
        const comment = ctx.store.updateComment(commentId, patch);
        if (!comment) {
          error(res, "Comment not found", 404);
          return true;
        }
        broadcastUpdate(ctx.store.getData());
        json(res, comment);
      } catch (err) {
        error(res, `Server error: ${errorMessage(err)}`, 500);
      }
      return true;
    }

    if (method === "DELETE") {
      const deleted = ctx.store.deleteComment(commentId);
      if (!deleted) {
        error(res, "Comment not found", 404);
        return true;
      }
      broadcastUpdate(ctx.store.getData());
      json(res, { ok: true });
      return true;
    }
  }

  return false;
}
