import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { watch } from "chokidar";
import { nanoid } from "nanoid";
import { ReviewDataSchema, type ReviewData, type Comment, type CreateComment, type UpdateComment } from "../shared/types.js";

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

  private load(ref: string): ReviewData {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      const initial: ReviewData = {
        version: 1,
        round: 1,
        status: "draft",
        ref,
        metadata: {},
        submittedAt: null,
        comments: [],
      };
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
      // Corrupted JSON — backup and create fresh
      console.warn("Warning: review.json is corrupted, creating backup...");
      const backupPath = this.filePath + ".backup." + Date.now();
      try {
        renameSync(this.filePath, backupPath);
        console.warn(`  Backed up to ${backupPath}`);
      } catch { /* ignore */ }
      const fresh: ReviewData = {
        version: 1,
        round: 1,
        status: "draft",
        ref,
        metadata: {},
        submittedAt: null,
        comments: [],
      };
      this.writeAtomic(fresh);
      return fresh;
    }
  }

  private writeAtomic(data: ReviewData): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = this.filePath + ".tmp." + process.pid;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
    renameSync(tmp, this.filePath);
    this.lastMtime = statSync(this.filePath).mtimeMs;
    this.data = data;
  }

  private reloadIfChanged(): void {
    try {
      const stat = statSync(this.filePath);
      if (stat.mtimeMs > this.lastMtime) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = ReviewDataSchema.parse(JSON.parse(raw));
        this.data = parsed;
        this.lastMtime = stat.mtimeMs;
      }
    } catch { /* ignore */ }
  }

  getData(): ReviewData {
    this.reloadIfChanged();
    return structuredClone(this.data);
  }

  getComments(): Comment[] {
    return this.getData().comments;
  }

  submitReview(drafts: CreateComment[]): ReviewData {
    this.reloadIfChanged();

    const now = new Date().toISOString();
    const newComments: Comment[] = drafts.map((d) => ({
      id: nanoid(8),
      type: "comment" as const,
      file: d.file,
      line: d.line,
      endLine: d.endLine ?? d.line,
      side: d.side,
      body: d.body,
      status: "pending" as const,
      thread: [],
      createdAt: now,
      resolvedAt: null,
    }));

    const updated: ReviewData = {
      ...this.data,
      status: "submitted",
      submittedAt: now,
      comments: [...this.data.comments, ...newComments],
    };

    this.writeAtomic(updated);
    return updated;
  }

  updateComment(id: string, patch: UpdateComment): Comment | null {
    this.reloadIfChanged();
    const idx = this.data.comments.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const comment = { ...this.data.comments[idx] };
    if (patch.reply) {
      comment.thread = [...(comment.thread ?? []), { author: "user" as const, body: patch.reply }];
      comment.status = "pending";
    }
    if (patch.status) comment.status = patch.status;
    if (patch.body) comment.body = patch.body;
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
