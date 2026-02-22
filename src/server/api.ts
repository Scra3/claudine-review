import type { IncomingMessage, ServerResponse } from "node:http";
import { getDiff, getFileContent } from "./git.js";
import { ReviewStore } from "./store.js";
import { addSSEClient, broadcastUpdate } from "./sse.js";
import {
  SubmitReviewSchema,
  UpdateCommentSchema,
} from "../shared/types.js";

export interface ApiContext {
  store: ReviewStore;
  repoRoot: string;
  ref: string;
  token: string;
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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function checkToken(url: URL, ctx: ApiContext, res: ServerResponse): boolean {
  const t = url.searchParams.get("token");
  if (t !== ctx.token) {
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

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  // SSE endpoint
  if (path === "/sse" && method === "GET") {
    if (!checkToken(url, ctx, res)) return true;
    addSSEClient(res);
    return true;
  }

  // API routes
  if (!path.startsWith("/api/")) return false;

  if (!checkToken(url, ctx, res)) return true;

  // GET /api/diff
  if (path === "/api/diff" && method === "GET") {
    const ref = url.searchParams.get("ref") ?? ctx.ref;
    try {
      const diff = getDiff(ctx.repoRoot, ref);
      json(res, diff);
    } catch (err) {
      error(res, `Failed to get diff: ${err}`, 500);
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

  // POST /api/comments — batch submit drafts
  if (path === "/api/comments" && method === "POST") {
    try {
      const body = await readBody(req);
      const parsed = SubmitReviewSchema.parse(JSON.parse(body));
      const updated = ctx.store.submitReview(parsed.comments);
      broadcastUpdate(updated);
      json(res, updated, 201);
    } catch (err) {
      error(res, `Invalid request: ${err}`);
    }
    return true;
  }

  // PATCH /api/comments/:id
  const patchMatch = path.match(/^\/api\/comments\/([a-zA-Z0-9_-]+)$/);
  if (patchMatch && method === "PATCH") {
    try {
      const body = await readBody(req);
      const patch = UpdateCommentSchema.parse(JSON.parse(body));
      const comment = ctx.store.updateComment(patchMatch[1], patch);
      if (!comment) {
        error(res, "Comment not found", 404);
        return true;
      }
      const updated = ctx.store.getData();
      broadcastUpdate(updated);
      json(res, comment);
    } catch (err) {
      error(res, `Invalid request: ${err}`);
    }
    return true;
  }

  // DELETE /api/comments/:id
  const deleteMatch = path.match(/^\/api\/comments\/([a-zA-Z0-9_-]+)$/);
  if (deleteMatch && method === "DELETE") {
    const deleted = ctx.store.deleteComment(deleteMatch[1]);
    if (!deleted) {
      error(res, "Comment not found", 404);
      return true;
    }
    const updated = ctx.store.getData();
    broadcastUpdate(updated);
    json(res, { ok: true });
    return true;
  }

  return false;
}
