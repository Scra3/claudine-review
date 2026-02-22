import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getDiff, getFileContent } from "../src/server/git";

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
    });
  });

  describe("getFileContent", () => {
    it("reads file from working tree", () => {
      const content = getFileContent(repoDir, "hello.txt");
      expect(content).toBe("Hello World\n");
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
