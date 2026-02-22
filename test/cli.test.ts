import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getDiff } from "../src/server/git";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-review-cli-test-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "hello.txt"), "Hello World\n");
  execSync("git add . && git commit -m 'init'", { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("CLI", () => {
  describe("port validation", () => {
    it("rejects non-numeric port", () => {
      const result = execSync(
        `node bin/claude-review.js --port abc 2>&1 || true`,
        { encoding: "utf-8" },
      );
      expect(result).toContain("invalid port");
    });

    it("rejects port above 65535", () => {
      const result = execSync(
        `node bin/claude-review.js --port 99999 2>&1 || true`,
        { encoding: "utf-8" },
      );
      expect(result).toContain("invalid port");
    });

    it("rejects port 0", () => {
      const result = execSync(
        `node bin/claude-review.js --port 0 2>&1 || true`,
        { encoding: "utf-8" },
      );
      expect(result).toContain("invalid port");
    });
  });

  describe("diff with custom ref", () => {
    let repoDir: string;

    beforeEach(() => {
      repoDir = createTempRepo();
    });

    afterEach(() => {
      rmSync(repoDir, { recursive: true, force: true });
    });

    it("diffs between two commits", () => {
      const firstCommit = execSync("git rev-parse HEAD", {
        cwd: repoDir,
        encoding: "utf-8",
      }).trim();

      writeFileSync(join(repoDir, "hello.txt"), "Hello Claude\n");
      execSync("git add . && git commit -m 'change'", { cwd: repoDir, stdio: "ignore" });

      const result = getDiff(repoDir, `${firstCommit}..HEAD`);
      expect(result.files.length).toBeGreaterThan(0);
      const file = result.files.find((f) => f.to === "hello.txt");
      expect(file).toBeDefined();
      expect(file!.additions).toBeGreaterThan(0);
    });

    it("diffs against a specific commit SHA", () => {
      const firstCommit = execSync("git rev-parse HEAD", {
        cwd: repoDir,
        encoding: "utf-8",
      }).trim();

      writeFileSync(join(repoDir, "new-file.txt"), "New content\n");
      execSync("git add . && git commit -m 'add file'", { cwd: repoDir, stdio: "ignore" });

      const result = getDiff(repoDir, firstCommit);
      const file = result.files.find((f) => f.to === "new-file.txt");
      expect(file).toBeDefined();
      expect(file!.new).toBe(true);
    });

    it("throws on invalid ref", () => {
      expect(() => getDiff(repoDir, "nonexistent-branch")).toThrow();
    });
  });
});
