import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { ReviewStore } from "../src/server/store";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-review-test-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  // Create initial commit
  execSync("touch README.md", { cwd: dir, stdio: "ignore" });
  execSync("git add .", { cwd: dir, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("ReviewStore", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("creates review.json on first load", () => {
    const store = new ReviewStore(repoDir, "HEAD");
    const data = store.getData();

    expect(data.version).toBe(1);
    expect(data.round).toBe(1);
    expect(data.status).toBe("draft");
    expect(data.comments).toEqual([]);
    expect(existsSync(join(repoDir, ".claude", "review.json"))).toBe(true);
  });

  it("submits review with comments", () => {
    const store = new ReviewStore(repoDir, "HEAD");

    const result = store.submitReview([
      { file: "index.html", line: 28, side: "new", body: "Fix title" },
      { file: "styles.css", line: 10, side: "new", body: "Check color" },
    ]);

    expect(result.status).toBe("submitted");
    expect(result.submittedAt).toBeTruthy();
    expect(result.comments).toHaveLength(2);
    expect(result.comments[0].status).toBe("pending");
    expect(result.comments[0].file).toBe("index.html");
    expect(result.comments[1].file).toBe("styles.css");
  });

  it("updates a comment status", () => {
    const store = new ReviewStore(repoDir, "HEAD");
    store.submitReview([
      { file: "index.html", line: 28, side: "new", body: "Fix title" },
    ]);

    const comment = store.getComments()[0];
    const updated = store.updateComment(comment.id, { status: "resolved" });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("resolved");
    expect(updated!.resolvedAt).toBeTruthy();
  });

  it("deletes a comment", () => {
    const store = new ReviewStore(repoDir, "HEAD");
    store.submitReview([
      { file: "index.html", line: 28, side: "new", body: "Fix title" },
    ]);

    const comment = store.getComments()[0];
    const deleted = store.deleteComment(comment.id);

    expect(deleted).toBe(true);
    expect(store.getComments()).toHaveLength(0);
  });

  it("returns false when deleting non-existent comment", () => {
    const store = new ReviewStore(repoDir, "HEAD");
    expect(store.deleteComment("nonexistent")).toBe(false);
  });

  it("atomic writes produce valid JSON", () => {
    const store = new ReviewStore(repoDir, "HEAD");
    store.submitReview([
      { file: "test.ts", line: 1, side: "new", body: "test" },
    ]);

    const raw = readFileSync(join(repoDir, ".claude", "review.json"), "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("sets status to resolved when all comments resolved", () => {
    const store = new ReviewStore(repoDir, "HEAD");
    store.submitReview([
      { file: "a.ts", line: 1, side: "new", body: "one" },
      { file: "b.ts", line: 2, side: "new", body: "two" },
    ]);

    const comments = store.getComments();
    store.updateComment(comments[0].id, { status: "resolved" });
    store.updateComment(comments[1].id, { status: "resolved" });

    expect(store.getData().status).toBe("resolved");
  });
});
