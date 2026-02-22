import { z } from "zod";

// ── Comment statuses ────────────────────────────────────────────────
export type CommentStatus = "draft" | "pending" | "resolved";

// ── Zod schemas ─────────────────────────────────────────────────────

export const ThreadEntrySchema = z.object({
  author: z.enum(["ai", "user"]),
  body: z.string().min(1),
  createdAt: z.string().datetime().optional(),
});

export const CommentSchema = z.object({
  id: z.string().min(1),
  type: z.literal("comment"),
  file: z.string().min(1),
  line: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  side: z.enum(["old", "new"]).default("new"),
  body: z.string().min(1),
  status: z.enum(["draft", "pending", "resolved"]),
  response: z.string().nullable().optional().default(null),
  thread: z.array(ThreadEntrySchema).default([]),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().default(null),
}).refine(
  (c) => !c.endLine || c.endLine >= c.line,
  { message: "endLine must be >= line" },
);

export const ReviewDataSchema = z.object({
  version: z.literal(1),
  round: z.number().int().positive(),
  status: z.enum(["draft", "submitted", "resolved"]),
  ref: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  submittedAt: z.string().datetime().nullable(),
  comments: z.array(CommentSchema),
});

export const CreateCommentSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  side: z.enum(["old", "new"]).default("new"),
  body: z.string().min(1),
}).refine(
  (c) => !c.endLine || c.endLine >= c.line,
  { message: "endLine must be >= line" },
);

export const UpdateCommentSchema = z.object({
  status: z.enum(["draft", "pending", "resolved"]).optional(),
  body: z.string().min(1).optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  reply: z.string().min(1).optional(),
});

export const AddCommentSchema = CreateCommentSchema;

// ── TypeScript types (inferred from Zod) ────────────────────────────

export type ThreadEntry = z.infer<typeof ThreadEntrySchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type ReviewData = z.infer<typeof ReviewDataSchema>;
export type CreateComment = z.infer<typeof CreateCommentSchema>;
export type UpdateComment = z.infer<typeof UpdateCommentSchema>;

// ── Diff types (from parse-diff) ────────────────────────────────────

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  changes: DiffChange[];
}

export interface DiffChange {
  type: "add" | "del" | "normal";
  content: string;
  ln?: number;   // line number from parse-diff: new-side for add, old-side for del
  ln1?: number;  // old line number (for normal)
  ln2?: number;  // new line number (for normal)
}

export interface DiffFile {
  from: string;
  to: string;
  additions: number;
  deletions: number;
  chunks: DiffHunk[];
  new: boolean;
  deleted: boolean;
  renamed: boolean;
}

// ── API response types ──────────────────────────────────────────────

export interface DiffResponse {
  ref: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export type SSEEvent =
  | { type: "comments-updated"; data: ReviewData }
  | { type: "connected"; data: { message: string } }
  | { type: "diff-changed"; data: { message: string } };
