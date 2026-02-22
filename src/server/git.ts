import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import parseDiff from "parse-diff";
import type { DiffFile, DiffResponse } from "../shared/types.js";

export function getDiff(repoRoot: string, ref: string): DiffResponse {
  let diffRaw: string;

  try {
    if (ref === "HEAD") {
      // Show both staged and unstaged changes
      diffRaw = execSync("git diff HEAD", {
        cwd: repoRoot,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      // If no diff against HEAD, try staged + unstaged separately
      if (!diffRaw.trim()) {
        const staged = execSync("git diff --cached", {
          cwd: repoRoot,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const unstaged = execSync("git diff", {
          cwd: repoRoot,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        diffRaw = staged + unstaged;
      }
    } else {
      diffRaw = execSync(`git diff ${ref}`, {
        cwd: repoRoot,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
    }
  } catch {
    diffRaw = "";
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
        type: ch.type === "add" ? "add" : ch.type === "del" ? "del" : "normal",
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
  // Validate path: no traversal
  const resolved = resolve(join(repoRoot, filePath));
  if (!resolved.startsWith(resolve(repoRoot) + "/")) {
    throw new Error("Path traversal detected");
  }

  try {
    return readFileSync(resolved, "utf-8");
  } catch {
    // Try from git index
    return execSync(`git show HEAD:${filePath}`, {
      cwd: repoRoot,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}
