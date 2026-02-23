import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { handleApiRequest, type ApiContext } from "../src/server/api";
import { ReviewStore } from "../src/server/store";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-review-api-test-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "hello.txt"), "Hello World\n");
  execSync("git add .", { cwd: dir, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("API", () => {
  let repoDir: string;
  let server: Server;
  let baseUrl: string;
  const token = "test-token-abc123";
  let store: ReviewStore;

  beforeEach(async () => {
    repoDir = createTempRepo();
    writeFileSync(join(repoDir, "hello.txt"), "Hello Claude\n");

    store = new ReviewStore(repoDir, "HEAD");

    const ctx: ApiContext = {
      store,
      repoRoot: repoDir,
      ref: "HEAD",
      token,
      port: 0,
    };

    server = createServer(async (req, res) => {
      const handled = await handleApiRequest(req, res, ctx);
      if (!handled) {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        ctx.port = addr.port;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(repoDir, { recursive: true, force: true });
  });

  function url(path: string): string {
    return `${baseUrl}${path}?token=${token}`;
  }

  // ── Authentication ─────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 without token", async () => {
      const res = await fetch(`${baseUrl}/api/comments`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 with wrong token", async () => {
      const res = await fetch(`${baseUrl}/api/comments?token=wrong-token`);
      expect(res.status).toBe(401);
    });

    it("returns 200 with correct token", async () => {
      const res = await fetch(url("/api/comments"));
      expect(res.status).toBe(200);
    });

    it("checks token on SSE endpoint", async () => {
      const res = await fetch(`${baseUrl}/sse`);
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/diff ──────────────────────────────────────────────────

  describe("GET /api/diff", () => {
    it("returns diff with changed files", async () => {
      const res = await fetch(url("/api/diff"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ref).toBe("HEAD");
      expect(data.files).toBeInstanceOf(Array);
      expect(data.files.length).toBeGreaterThan(0);
      expect(data.totalAdditions).toBeGreaterThan(0);

      const file = data.files.find((f: any) => f.to === "hello.txt");
      expect(file).toBeDefined();
      expect(file.chunks.length).toBeGreaterThan(0);
    });
  });

  // ── GET /api/file ──────────────────────────────────────────────────

  describe("GET /api/file", () => {
    it("returns file content", async () => {
      const res = await fetch(url("/api/file") + "&path=hello.txt");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("Hello Claude\n");
    });

    it("returns 400 without path param", async () => {
      const res = await fetch(url("/api/file"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("path");
    });

    it("returns 403 on path traversal", async () => {
      const res = await fetch(url("/api/file") + "&path=../../../etc/passwd");
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("traversal");
    });

    it("returns 404 for non-existent file", async () => {
      const res = await fetch(url("/api/file") + "&path=does-not-exist.txt");
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/comments ──────────────────────────────────────────────

  describe("GET /api/comments", () => {
    it("returns review data structure", async () => {
      const res = await fetch(url("/api/comments"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.version).toBe(1);
      expect(data.status).toBe("draft");
      expect(data.comments).toEqual([]);
      expect(data.summary).toBeNull();
    });

    it("reflects submitted comments", async () => {
      store.addComment({ file: "hello.txt", line: 1, side: "new", body: "Fix" });

      const res = await fetch(url("/api/comments"));
      const data = await res.json();
      expect(data.status).toBe("submitted");
      expect(data.comments).toHaveLength(1);
      expect(data.comments[0].body).toBe("Fix");
    });
  });

  // ── POST /api/comments ─────────────────────────────────────────────

  describe("POST /api/comments", () => {
    it("adds a comment and returns 201", async () => {
      const res = await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "hello.txt", line: 1, side: "new", body: "Fix this line" }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.status).toBe("submitted");
      expect(data.submittedAt).toBeTruthy();
      expect(data.comments).toHaveLength(1);
      expect(data.comments[0].body).toBe("Fix this line");
      expect(data.comments[0].status).toBe("pending");
      expect(data.comments[0].id).toBeTruthy();
    });

    it("persists comment to store", async () => {
      await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "hello.txt", line: 1, side: "new", body: "Persisted" }),
      });

      const stored = store.getComments();
      expect(stored).toHaveLength(1);
      expect(stored[0].body).toBe("Persisted");
    });

    it("returns 400 on missing required fields", async () => {
      const res = await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "a.ts" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 on malformed JSON", async () => {
      const res = await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{{{",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 on empty body", async () => {
      const res = await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("rejects body larger than 1MB", async () => {
      const largeBody = JSON.stringify({ file: "a.ts", line: 1, side: "new", body: "x".repeat(1_100_000) });
      const res = await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: largeBody,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("too large");
    });
  });

  // ── PATCH /api/comments/:id ────────────────────────────────────────

  describe("PATCH /api/comments/:id", () => {
    let commentId: string;

    beforeEach(async () => {
      await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "hello.txt", line: 1, side: "new", body: "Review this" }),
      });
      commentId = store.getComments()[0].id;
    });

    it("resolves a comment", async () => {
      const res = await fetch(url(`/api/comments/${commentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("resolved");
      expect(data.resolvedAt).toBeTruthy();
    });

    it("reopens a resolved comment", async () => {
      store.updateComment(commentId, { status: "resolved" });

      const res = await fetch(url(`/api/comments/${commentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", resolvedAt: null }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("pending");
      expect(data.resolvedAt).toBeNull();
    });

    it("adds a reply to the thread", async () => {
      const res = await fetch(url(`/api/comments/${commentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: "Done, fixed in next commit" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.thread).toHaveLength(1);
      expect(data.thread[0].author).toBe("user");
      expect(data.thread[0].body).toBe("Done, fixed in next commit");
      expect(data.thread[0].createdAt).toBeTruthy();
      expect(data.status).toBe("pending");
    });

    it("returns 404 for non-existent comment", async () => {
      const res = await fetch(url("/api/comments/nonexistent"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 on invalid patch body", async () => {
      const res = await fetch(url(`/api/comments/${commentId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "bad json",
      });
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/comments/:id ───────────────────────────────────────

  describe("DELETE /api/comments/:id", () => {
    it("deletes a comment and confirms via store", async () => {
      await fetch(url("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "hello.txt", line: 1, side: "new", body: "Delete me" }),
      });
      const id = store.getComments()[0].id;

      const res = await fetch(url(`/api/comments/${id}`), { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      expect(store.getComments()).toHaveLength(0);
    });

    it("returns 404 for non-existent comment", async () => {
      const res = await fetch(url("/api/comments/nonexistent"), { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/summary ────────────────────────────────────────────

  describe("POST /api/summary", () => {
    it("sets summary and returns 201", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: "Refactors auth to JWT",
          files: { "src/auth.ts": "New JWT middleware" },
          testPlan: [{ description: "Login with valid token", expected: "200 OK" }],
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.summary).toBeDefined();
      expect(data.summary.global).toBe("Refactors auth to JWT");
      expect(data.summary.files["src/auth.ts"]).toBe("New JWT middleware");
      expect(data.summary.testPlan).toHaveLength(1);
    });

    it("returns 400 when global is missing", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when global is empty string", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 on malformed JSON", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{{{",
      });
      expect(res.status).toBe(400);
    });

    it("accepts just global without files and testPlan", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: "Simple summary" }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.summary.global).toBe("Simple summary");
      expect(data.summary.files).toEqual({});
      expect(data.summary.testPlan).toEqual([]);
    });

    it("returns 401 without token", async () => {
      const res = await fetch(`${baseUrl}/api/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: "Unauthorized attempt" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when testPlan entry has empty description", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: "Summary",
          testPlan: [{ description: "", expected: "200 OK" }],
        }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when testPlan entry is missing expected", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: "Summary",
          testPlan: [{ description: "Do something" }],
        }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when files values are not strings", async () => {
      const res = await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: "Summary", files: { "a.ts": 123 } }),
      });
      expect(res.status).toBe(400);
    });

    it("summary is included in GET /api/comments after POST", async () => {
      await fetch(url("/api/summary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: "Test summary" }),
      });

      const res = await fetch(url("/api/comments"));
      const data = await res.json();
      expect(data.summary).toBeDefined();
      expect(data.summary.global).toBe("Test summary");
    });
  });

  // ── Non-API paths ──────────────────────────────────────────────────

  describe("non-API paths", () => {
    it("returns false (not handled) for non-API paths", async () => {
      const res = await fetch(`${baseUrl}/some-page`);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe("Not found");
    });
  });
});
