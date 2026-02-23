import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { watch } from "chokidar";
import { nanoid } from "nanoid";
import { ReviewDataSchema, type ReviewData, type Comment, type CreateComment, type UpdateComment, type Summary } from "../shared/types.js";

export class ReviewStore {
  private filePath: string;
  private data: ReviewData;
  private lastMtime: number = 0;
  private onChange: (() => void) | null = null;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(repoRoot: string, ref: string) {
    this.filePath = join(repoRoot, ".claude", "review.json");
    this.data = this.load(ref);
  }

  private static emptyReview(ref: string): ReviewData {
    return {
      version: 1,
      round: 1,
      status: "draft",
      ref,
      metadata: {},
      submittedAt: null,
      comments: [],
      summary: null,
    };
  }

  private load(ref: string): ReviewData {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      const initial = ReviewStore.emptyReview(ref);
      this.writeAtomic(initial);
      return initial;
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const result = ReviewDataSchema.parse(parsed);
      this.lastMtime = statSync(this.filePath).mtimeMs;
      return result;
    } catch (err) {
      // Failed to read or validate review.json — backup and create fresh
      console.warn("Warning: review.json is corrupted, creating backup...");
      const backupPath = this.filePath + ".backup." + Date.now();
      try {
        renameSync(this.filePath, backupPath);
        console.warn(`  Backed up to ${backupPath}`);
      } catch (backupErr) {
        console.error(`CRITICAL: Failed to back up corrupted review.json: ${backupErr}`);
        console.error(`  The corrupted file will be overwritten. Data may be lost.`);
      }
      const fresh = ReviewStore.emptyReview(ref);
      this.writeAtomic(fresh);
      return fresh;
    }
  }

  // Atomic write: write to temp file then rename to avoid partial reads
  private writeAtomic(data: ReviewData): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    ReviewDataSchema.parse(data);
    const tmp = this.filePath + ".tmp." + process.pid;
    try {
      writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
      renameSync(tmp, this.filePath);
    } catch (err) {
      try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
      throw err;
    }
    this.lastMtime = statSync(this.filePath).mtimeMs;
    this.data = data;
  }

  // Optimistic reload: check mtime to pick up external modifications (e.g., by Claude Code)
  // Throws on failure so write-path callers don't proceed with stale data.
  private reloadIfChanged(): void {
    const stat = statSync(this.filePath);
    if (stat.mtimeMs > this.lastMtime) {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = ReviewDataSchema.parse(JSON.parse(raw));
      this.data = parsed;
      this.lastMtime = stat.mtimeMs;
    }
  }

  getData(): ReviewData {
    try {
      this.reloadIfChanged();
    } catch (err) {
      console.error(`Failed to reload review.json: ${err}`);
    }
    return structuredClone(this.data);
  }

  getComments(): Comment[] {
    return this.getData().comments;
  }

  addComment(draft: CreateComment): ReviewData {
    this.reloadIfChanged();

    const now = new Date().toISOString();
    const newComment: Comment = {
      id: nanoid(8),
      type: "comment" as const,
      file: draft.file,
      line: draft.line,
      endLine: draft.endLine ?? draft.line,
      side: draft.side,
      body: draft.body,
      status: "pending" as const,
      response: null,
      thread: [],
      createdAt: now,
      resolvedAt: null,
    };

    const updated: ReviewData = {
      ...this.data,
      status: "submitted",
      submittedAt: this.data.submittedAt ?? now,
      comments: [...this.data.comments, newComment],
    };

    this.writeAtomic(updated);
    return updated;
  }

  updateComment(id: string, patch: UpdateComment): Comment | null {
    this.reloadIfChanged();
    const idx = this.data.comments.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const comment = { ...this.data.comments[idx] };
    if (patch.reply !== undefined) {
      comment.thread = [
        ...(comment.thread ?? []),
        { author: "user" as const, body: patch.reply, createdAt: new Date().toISOString() },
      ];
      comment.status = "pending";
    }
    if (patch.status !== undefined) comment.status = patch.status;
    if (patch.body !== undefined) comment.body = patch.body;
    if (patch.resolvedAt !== undefined) comment.resolvedAt = patch.resolvedAt;
    if (patch.status === "resolved" && !comment.resolvedAt) {
      comment.resolvedAt = new Date().toISOString();
    }

    const updated = { ...this.data };
    updated.comments = [...this.data.comments];
    updated.comments[idx] = comment;

    // If all comments resolved, update status
    if (updated.comments.every((c) => c.status === "resolved")) {
      updated.status = "resolved";
    }

    this.writeAtomic(updated);
    return comment;
  }

  deleteComment(id: string): boolean {
    this.reloadIfChanged();
    const before = this.data.comments.length;
    const updated = {
      ...this.data,
      comments: this.data.comments.filter((c) => c.id !== id),
    };
    if (updated.comments.length === before) return false;
    this.writeAtomic(updated);
    return true;
  }

  setSummary(summary: Summary): ReviewData {
    this.reloadIfChanged();
    const updated: ReviewData = {
      ...this.data,
      summary,
    };
    this.writeAtomic(updated);
    return updated;
  }

  startWatching(callback: () => void): void {
    this.onChange = callback;
    this.watcher = watch(this.filePath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });
    this.watcher.on("change", () => {
      this.reloadIfChanged();
      this.onChange?.();
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    this.onChange = null;
  }

  getFilePath(): string {
    return this.filePath;
  }
}
