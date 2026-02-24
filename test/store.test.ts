import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { ReviewStore } from "../src/server/store";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claudine-review-test-"));
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
    const store = new ReviewStore(repoDir, "HEAD", "main");
    const data = store.getData();

    expect(data.version).toBe(1);
    expect(data.round).toBe(1);
    expect(data.status).toBe("draft");
    expect(data.comments).toEqual([]);
    expect(existsSync(join(repoDir, ".claude", "review.json"))).toBe(true);
  });

  it("adds comments one by one", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");

    const result1 = store.addComment({ file: "index.html", line: 28, side: "new", body: "Fix title" });
    expect(result1.status).toBe("submitted");
    expect(result1.submittedAt).toBeTruthy();
    expect(result1.comments).toHaveLength(1);
    expect(result1.comments[0].status).toBe("pending");
    expect(result1.comments[0].file).toBe("index.html");

    const result2 = store.addComment({ file: "styles.css", line: 10, side: "new", body: "Check color" });
    expect(result2.comments).toHaveLength(2);
    expect(result2.comments[1].file).toBe("styles.css");
    // submittedAt should not change after first comment
    expect(result2.submittedAt).toBe(result1.submittedAt);
  });

  it("updates a comment status", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "index.html", line: 28, side: "new", body: "Fix title" });

    const comment = store.getComments()[0];
    const updated = store.updateComment(comment.id, { status: "resolved" });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("resolved");
    expect(updated!.resolvedAt).toBeTruthy();
  });

  it("deletes a comment", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "index.html", line: 28, side: "new", body: "Fix title" });

    const comment = store.getComments()[0];
    const deleted = store.deleteComment(comment.id);

    expect(deleted).toBe(true);
    expect(store.getComments()).toHaveLength(0);
  });

  it("returns false when deleting non-existent comment", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    expect(store.deleteComment("nonexistent")).toBe(false);
  });

  it("atomic writes produce valid JSON matching store data", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "test.ts", line: 1, side: "new", body: "test" });

    const raw = readFileSync(join(repoDir, ".claude", "review.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.status).toBe("submitted");
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].body).toBe("test");
    expect(parsed.comments[0].file).toBe("test.ts");
  });

  it("sets status to resolved when all comments resolved", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "one" });
    store.addComment({ file: "b.ts", line: 2, side: "new", body: "two" });

    const comments = store.getComments();
    store.updateComment(comments[0].id, { status: "resolved" });
    store.updateComment(comments[1].id, { status: "resolved" });

    expect(store.getData().status).toBe("resolved");
  });

  // ── Reply / Thread ──────────────────────────────────────────────────

  it("adds a reply to the thread with createdAt", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "Needs fix" });

    const id = store.getComments()[0].id;
    const updated = store.updateComment(id, { reply: "Fixed in next commit" });

    expect(updated).not.toBeNull();
    expect(updated!.thread).toHaveLength(1);
    expect(updated!.thread![0].author).toBe("user");
    expect(updated!.thread![0].body).toBe("Fixed in next commit");
    expect(updated!.thread![0].createdAt).toBeTruthy();
    // Reply resets status to pending
    expect(updated!.status).toBe("pending");
  });

  it("accumulates multiple replies in the thread", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "Check this" });

    const id = store.getComments()[0].id;
    store.updateComment(id, { reply: "First reply" });
    const updated = store.updateComment(id, { reply: "Second reply" });

    expect(updated!.thread).toHaveLength(2);
    expect(updated!.thread![0].body).toBe("First reply");
    expect(updated!.thread![1].body).toBe("Second reply");
  });

  // ── Reopen ──────────────────────────────────────────────────────────

  it("reopens a resolved comment", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "Fix" });

    const id = store.getComments()[0].id;
    store.updateComment(id, { status: "resolved" });
    expect(store.getComments()[0].status).toBe("resolved");
    expect(store.getComments()[0].resolvedAt).toBeTruthy();

    const reopened = store.updateComment(id, { status: "pending", resolvedAt: null });
    expect(reopened!.status).toBe("pending");
    expect(reopened!.resolvedAt).toBeNull();
  });

  // ── Corrupted file recovery ─────────────────────────────────────────

  it("recovers from corrupted review.json by creating backup", () => {
    // Create a valid store first
    new ReviewStore(repoDir, "HEAD", "main");
    const reviewPath = join(repoDir, ".claude", "review.json");
    expect(existsSync(reviewPath)).toBe(true);

    // Corrupt the file
    writeFileSync(reviewPath, "NOT VALID JSON {{{{");

    // Loading should recover gracefully
    const store2 = new ReviewStore(repoDir, "HEAD", "main");
    const data = store2.getData();
    expect(data.version).toBe(1);
    expect(data.status).toBe("draft");
    expect(data.comments).toEqual([]);

    // Backup file should exist
    const claudeDir = join(repoDir, ".claude");
    const files = execSync(`ls "${claudeDir}"`, { encoding: "utf-8" });
    expect(files).toContain("review.json.backup.");
  });

  // ── External modification reload ────────────────────────────────────

  it("picks up external modifications on next read", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "Original" });

    // Simulate external modification (e.g., Claude Code editing the file)
    const reviewPath = join(repoDir, ".claude", "review.json");
    const raw = JSON.parse(readFileSync(reviewPath, "utf-8"));
    raw.comments[0].status = "resolved";
    raw.comments[0].resolvedAt = new Date().toISOString();
    raw.comments[0].response = "Done";
    // Bump mtime by writing with a small delay
    writeFileSync(reviewPath, JSON.stringify(raw, null, 2) + "\n");

    // Store should pick up the change on next read
    const comments = store.getComments();
    expect(comments[0].status).toBe("resolved");
    expect(comments[0].response).toBe("Done");
  });

  // ── Update non-existent comment ─────────────────────────────────────

  it("returns null when updating non-existent comment", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    const result = store.updateComment("nonexistent", { status: "resolved" });
    expect(result).toBeNull();
  });

  // ── Summary ─────────────────────────────────────────────────────────

  it("summary is null by default", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    const data = store.getData();
    expect(data.summary).toBeNull();
  });

  it("setSummary writes and persists the summary", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    const summary = {
      global: "Refactors auth to JWT",
      files: { "src/auth.ts": "New JWT middleware" },
      testPlan: [{ description: "Login with valid token", expected: "200 OK" }],
    };
    const result = store.setSummary(summary);

    expect(result.summary).toEqual(summary);
    expect(store.getData().summary).toEqual(summary);

    // Verify persistence on disk
    const raw = readFileSync(join(repoDir, ".claude", "review.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.summary.global).toBe("Refactors auth to JWT");
  });

  it("setSummary preserves existing comments", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "Fix this" });
    store.setSummary({
      global: "Changes applied",
      files: { "a.ts": "Fixed issue" },
      testPlan: [],
    });
    const data = store.getData();
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].body).toBe("Fix this");
    expect(data.summary!.global).toBe("Changes applied");
  });

  it("setSummary picks up externally added comments before writing", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.addComment({ file: "a.ts", line: 1, side: "new", body: "Original" });

    // Simulate Claude Code adding a thread reply externally
    const reviewPath = join(repoDir, ".claude", "review.json");
    const raw = JSON.parse(readFileSync(reviewPath, "utf-8"));
    raw.comments[0].thread = [{ author: "ai", body: "Done", createdAt: new Date().toISOString() }];
    writeFileSync(reviewPath, JSON.stringify(raw, null, 2) + "\n");

    // setSummary should not lose the external thread entry
    store.setSummary({ global: "Summary", files: {}, testPlan: [] });

    const data = store.getData();
    expect(data.comments[0].thread).toHaveLength(1);
    expect(data.comments[0].thread[0].body).toBe("Done");
    expect(data.summary!.global).toBe("Summary");
  });

  it("setSummary overwrites the previous summary", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    store.setSummary({
      global: "First summary",
      files: {},
      testPlan: [],
    });
    store.setSummary({
      global: "Updated summary",
      files: { "a.ts": "Changed" },
      testPlan: [{ description: "Test A", expected: "Pass" }],
    });
    const data = store.getData();
    expect(data.summary!.global).toBe("Updated summary");
    expect(data.summary!.files).toEqual({ "a.ts": "Changed" });
    expect(data.summary!.testPlan).toHaveLength(1);
  });

  // ── Branch switching ────────────────────────────────────────────────

  it("fresh review includes branch field", () => {
    const store = new ReviewStore(repoDir, "HEAD", "main");
    const data = store.getData();
    expect(data.branch).toBe("main");
  });

  it("same branch loads normally and keeps comments", () => {
    const store1 = new ReviewStore(repoDir, "HEAD", "main");
    store1.addComment({ file: "a.ts", line: 1, side: "new", body: "Keep me" });

    const store2 = new ReviewStore(repoDir, "HEAD", "main");
    const data = store2.getData();
    expect(data.branch).toBe("main");
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].body).toBe("Keep me");
  });

  it("different branch creates backup and fresh review", () => {
    const store1 = new ReviewStore(repoDir, "HEAD", "main");
    store1.addComment({ file: "a.ts", line: 1, side: "new", body: "Old comment" });

    const store2 = new ReviewStore(repoDir, "HEAD", "feature");
    const data = store2.getData();
    expect(data.branch).toBe("feature");
    expect(data.comments).toEqual([]);

    // Backup file should exist with old data
    const claudeDir = join(repoDir, ".claude");
    const files = execSync(`ls "${claudeDir}"`, { encoding: "utf-8" });
    expect(files).toContain("review.json.backup.main.");

    // Verify backup contains old comment
    const backupFile = files.split("\n").find((f: string) => f.startsWith("review.json.backup.main."));
    const backupData = JSON.parse(readFileSync(join(claudeDir, backupFile!), "utf-8"));
    expect(backupData.comments).toHaveLength(1);
    expect(backupData.comments[0].body).toBe("Old comment");
  });

  it("legacy file without branch adopts current branch without reset", () => {
    // Create a review file without branch field (legacy)
    const claudeDir = join(repoDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const reviewPath = join(claudeDir, "review.json");
    const legacy = {
      version: 1,
      round: 1,
      status: "submitted",
      ref: "HEAD",
      metadata: {},
      submittedAt: new Date().toISOString(),
      comments: [{
        id: "legacy1",
        type: "comment",
        file: "old.ts",
        line: 5,
        side: "new",
        body: "Legacy comment",
        status: "pending",
        response: null,
        thread: [],
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      }],
      summary: null,
    };
    writeFileSync(reviewPath, JSON.stringify(legacy, null, 2) + "\n");

    const store = new ReviewStore(repoDir, "HEAD", "main");
    const data = store.getData();

    // Should adopt branch without resetting
    expect(data.branch).toBe("main");
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].body).toBe("Legacy comment");

    // Branch should be persisted to disk
    const onDisk = JSON.parse(readFileSync(reviewPath, "utf-8"));
    expect(onDisk.branch).toBe("main");

    // No backup should be created
    const files = execSync(`ls "${claudeDir}"`, { encoding: "utf-8" });
    expect(files).not.toContain("review.json.backup.");
  });

  it("detached HEAD skips branch-switch detection", () => {
    const store1 = new ReviewStore(repoDir, "HEAD", "main");
    store1.addComment({ file: "a.ts", line: 1, side: "new", body: "Keep me" });

    // Simulate detached HEAD — should NOT trigger backup+reset
    const store2 = new ReviewStore(repoDir, "HEAD", "HEAD");
    const data = store2.getData();
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].body).toBe("Keep me");
    // branch stays as "main" since HEAD doesn't overwrite it
    expect(data.branch).toBe("main");

    // No backup should be created
    const claudeDir = join(repoDir, ".claude");
    const files = execSync(`ls "${claudeDir}"`, { encoding: "utf-8" });
    expect(files).not.toContain("review.json.backup.");
  });

  it("branch names with / are sanitized in backup filename", () => {
    const store1 = new ReviewStore(repoDir, "HEAD", "feature/auth");
    store1.addComment({ file: "a.ts", line: 1, side: "new", body: "Comment" });

    // Switch to different branch
    new ReviewStore(repoDir, "HEAD", "develop");

    const claudeDir = join(repoDir, ".claude");
    const files = execSync(`ls "${claudeDir}"`, { encoding: "utf-8" });
    // Should use sanitized name (/ replaced with -)
    expect(files).toContain("review.json.backup.feature-auth.");
    expect(files).not.toContain("review.json.backup.feature/auth.");
  });
});
