import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getDiff, getBranch, getFileContent } from "../src/server/git";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-review-git-test-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "hello.txt"), "Hello World\n");
  execSync("git add .", { cwd: dir, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("git", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe("getDiff", () => {
    it("returns empty when no changes", () => {
      const result = getDiff(repoDir, "HEAD");
      expect(result.files).toHaveLength(0);
    });

    it("detects modified files", () => {
      writeFileSync(join(repoDir, "hello.txt"), "Hello Claude\n");
      const result = getDiff(repoDir, "HEAD");
      expect(result.files.length).toBeGreaterThanOrEqual(1);
      const file = result.files.find((f) => f.to === "hello.txt");
      expect(file).toBeDefined();
      expect(file!.additions).toBeGreaterThan(0);
    });

    it("detects new files", () => {
      writeFileSync(join(repoDir, "new.txt"), "New file\n");
      execSync("git add new.txt", { cwd: repoDir, stdio: "ignore" });
      const result = getDiff(repoDir, "HEAD");
      const file = result.files.find((f) => f.to === "new.txt");
      expect(file).toBeDefined();
      expect(file!.new).toBe(true);
      expect(file!.additions).toBeGreaterThan(0);
    });
  });

  describe("getBranch", () => {
    it("returns the current branch name", () => {
      const branch = getBranch(repoDir);
      // Default branch in a fresh git init is typically "main" or "master"
      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    });

    it("returns the correct name after switching branches", () => {
      execSync("git checkout -b feat/test-branch", { cwd: repoDir, stdio: "ignore" });
      const branch = getBranch(repoDir);
      expect(branch).toBe("feat/test-branch");
    });

    it("returns HEAD for detached HEAD state", () => {
      const sha = execSync("git rev-parse HEAD", { cwd: repoDir, encoding: "utf-8" }).trim();
      execSync(`git checkout ${sha}`, { cwd: repoDir, stdio: "ignore" });
      const branch = getBranch(repoDir);
      expect(branch).toBe("HEAD");
    });
  });

  describe("getFileContent", () => {
    it("reads file from working tree", () => {
      const content = getFileContent(repoDir, "hello.txt");
      expect(content).toBe("Hello World\n");
    });

    it("falls back to git when file is deleted from disk", () => {
      // hello.txt is committed with "Hello World\n"
      // Delete it from the working tree
      rmSync(join(repoDir, "hello.txt"));

      // Should fall back to git show HEAD:hello.txt
      const content = getFileContent(repoDir, "hello.txt");
      expect(content).toBe("Hello World\n");
    });

    it("throws for file that doesn't exist in working tree or git", () => {
      expect(() => getFileContent(repoDir, "never-existed.txt")).toThrow();
    });

    it("rejects path traversal", () => {
      expect(() => getFileContent(repoDir, "../../../etc/passwd")).toThrow(
        "Path traversal detected",
      );
    });

    it("rejects absolute path traversal", () => {
      expect(() => getFileContent(repoDir, "/etc/passwd")).toThrow();
    });
  });
});
