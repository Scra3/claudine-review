import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getDiff, getBranch, getFileContent, getDefaultBranch, getMergeBase } from "../src/server/git";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claudine-review-git-test-"));
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

  describe("getDefaultBranch", () => {
    it("detects the default branch via origin remote", () => {
      // Set up a bare "origin" so origin/main exists
      const bareDir = mkdtempSync(join(tmpdir(), "claudine-review-bare-"));
      execSync("git clone --bare " + repoDir + " " + bareDir, { stdio: "ignore" });
      execSync("git remote add origin " + bareDir, { cwd: repoDir, stdio: "ignore" });
      execSync("git fetch origin", { cwd: repoDir, stdio: "ignore" });

      const branch = getDefaultBranch(repoDir);
      expect(branch).toMatch(/^(main|master)$/);
      rmSync(bareDir, { recursive: true, force: true });
    });

    it("returns null when no origin remote exists", () => {
      // Fresh repo with no remote — no origin/main or origin/master
      const branch = getDefaultBranch(repoDir);
      expect(branch).toBeNull();
    });
  });

  describe("getMergeBase", () => {
    it("returns SHA when on a feature branch diverged from default", () => {
      // Set up a bare "origin" so origin/main exists
      const bareDir = mkdtempSync(join(tmpdir(), "claudine-review-bare-"));
      execSync("git clone --bare " + repoDir + " " + bareDir, { stdio: "ignore" });
      execSync("git remote add origin " + bareDir, { cwd: repoDir, stdio: "ignore" });
      execSync("git fetch origin", { cwd: repoDir, stdio: "ignore" });

      // Get the SHA of the initial commit (on main/master)
      const initSha = execSync("git rev-parse HEAD", { cwd: repoDir, encoding: "utf-8" }).trim();

      // Create a feature branch with a new commit
      execSync("git checkout -b feature/test", { cwd: repoDir, stdio: "ignore" });
      writeFileSync(join(repoDir, "feature.txt"), "feature work\n");
      execSync("git add feature.txt", { cwd: repoDir, stdio: "ignore" });
      execSync('git commit -m "feature commit"', { cwd: repoDir, stdio: "ignore" });

      const mergeBase = getMergeBase(repoDir);
      expect(mergeBase).toBe(initSha);
      rmSync(bareDir, { recursive: true, force: true });
    });

    it("returns null when on the default branch itself", () => {
      // Set up origin so detection works, but we stay on main
      const bareDir = mkdtempSync(join(tmpdir(), "claudine-review-bare-"));
      execSync("git clone --bare " + repoDir + " " + bareDir, { stdio: "ignore" });
      execSync("git remote add origin " + bareDir, { cwd: repoDir, stdio: "ignore" });
      execSync("git fetch origin", { cwd: repoDir, stdio: "ignore" });

      const mergeBase = getMergeBase(repoDir);
      expect(mergeBase).toBeNull();
      rmSync(bareDir, { recursive: true, force: true });
    });

    it("returns null when no default branch can be detected", () => {
      // No remote at all
      const mergeBase = getMergeBase(repoDir);
      expect(mergeBase).toBeNull();
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
