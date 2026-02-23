import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import parseDiff from "parse-diff";
import type { DiffFile, DiffResponse } from "../shared/types.js";

const GIT_EXEC_OPTS = { encoding: "utf-8" as const, maxBuffer: 10 * 1024 * 1024 };

export function getBranch(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, ...GIT_EXEC_OPTS }).trim();
  } catch {
    return "HEAD";
  }
}

export function getDiff(repoRoot: string, ref: string): DiffResponse {
  let diffRaw: string;

  if (ref === "HEAD") {
    diffRaw = execFileSync("git", ["diff", "HEAD"], { cwd: repoRoot, ...GIT_EXEC_OPTS });
    if (!diffRaw.trim()) {
      const staged = execFileSync("git", ["diff", "--cached"], { cwd: repoRoot, ...GIT_EXEC_OPTS });
      const unstaged = execFileSync("git", ["diff"], { cwd: repoRoot, ...GIT_EXEC_OPTS });
      diffRaw = staged + unstaged;
    }
  } else {
    diffRaw = execFileSync("git", ["diff", ref], { cwd: repoRoot, ...GIT_EXEC_OPTS });
  }

  if (!diffRaw.trim()) {
    return { ref, files: [], totalAdditions: 0, totalDeletions: 0 };
  }

  const parsed = parseDiff(diffRaw);

  const files: DiffFile[] = parsed.map((f) => ({
    from: f.from ?? "/dev/null",
    to: f.to ?? "/dev/null",
    additions: f.additions,
    deletions: f.deletions,
    chunks: f.chunks.map((c) => ({
      oldStart: c.oldStart,
      oldLines: c.oldLines,
      newStart: c.newStart,
      newLines: c.newLines,
      content: c.content,
      changes: c.changes.map((ch) => ({
        type: ch.type as "add" | "del" | "normal",
        content: ch.content,
        ln: "ln" in ch ? (ch.ln as number) : undefined,
        ln1: "ln1" in ch ? (ch.ln1 as number) : undefined,
        ln2: "ln2" in ch ? (ch.ln2 as number) : undefined,
      })),
    })),
    new: f.new ?? false,
    deleted: f.deleted ?? false,
    renamed: !!(
      f.from &&
      f.to &&
      f.from !== f.to &&
      f.from !== "/dev/null" &&
      f.to !== "/dev/null"
    ),
  }));

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return { ref, files, totalAdditions, totalDeletions };
}

export function getFileContent(repoRoot: string, filePath: string): string {
  // Security: prevent directory traversal attacks via /api/file
  const resolved = resolve(join(repoRoot, filePath));
  if (!resolved.startsWith(resolve(repoRoot) + "/")) {
    throw new Error("Path traversal detected");
  }

  try {
    return readFileSync(resolved, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    // File not on disk — try reading from HEAD commit
    return execFileSync("git", ["show", `HEAD:${filePath}`], {
      cwd: repoRoot,
      ...GIT_EXEC_OPTS,
    });
  }
}
