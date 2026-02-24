import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getFileContent } from "../src/server/git";

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "claudine-review-sec-test-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "safe.txt"), "safe content\n");
  execSync("git add .", { cwd: dir, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
  return dir;
}

describe("Security — path traversal", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  const maliciousPaths = [
    "../../../etc/passwd",
    "../../etc/shadow",
    "../package.json",
    "foo/../../etc/passwd",
    "foo/../../../etc/passwd",
    "/etc/passwd",
    "foo/bar/../../../etc/hosts",
  ];

  for (const path of maliciousPaths) {
    it(`blocks path: ${path}`, () => {
      expect(() => getFileContent(repoDir, path)).toThrow();
    });
  }

  it("allows normal path", () => {
    const content = getFileContent(repoDir, "safe.txt");
    expect(content).toBe("safe content\n");
  });

  it("allows nested path", () => {
    const subdir = join(repoDir, "src");
    execSync(`mkdir -p ${subdir}`, { stdio: "ignore" });
    writeFileSync(join(subdir, "app.ts"), "export default {};\n");
    const content = getFileContent(repoDir, "src/app.ts");
    expect(content).toBe("export default {};\n");
  });
});
