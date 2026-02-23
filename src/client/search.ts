import type { DiffFile, DiffChange, Comment } from "../shared/types";
import { getFileName } from "./utils";

export interface SearchResult {
  type: "diff" | "comment";
  file: string;
  line: number;
  side: "old" | "new";
  snippet: string;
  commentId?: string;
}

/** Search diff content and comment bodies for a query string. */
export function buildSearchResults(
  query: string,
  files: DiffFile[],
  comments: Comment[],
): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const file of files) {
    const name = getFileName(file);
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.content.toLowerCase().includes(q)) {
          const line = lineFromChange(change);
          if (line == null || line <= 0) continue;
          results.push({
            type: "diff",
            file: name,
            line,
            side: change.type === "del" ? "old" : "new",
            snippet: change.content,
          });
        }
      }
    }
  }

  for (const c of comments) {
    const bodies = [c.body, ...c.thread.map((t) => t.body)];
    for (const body of bodies) {
      if (body.toLowerCase().includes(q)) {
        results.push({ type: "comment", file: c.file, line: c.line, side: c.side, snippet: body, commentId: c.id });
      }
    }
  }

  return results;
}

function lineFromChange(change: DiffChange): number | undefined {
  return change.type === "del" ? change.ln : (change.ln2 ?? change.ln);
}

/** Truncate text to a window centered on the first match of query. */
export function truncateSnippet(text: string, query: string, maxLen = 120): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text.slice(0, maxLen);

  const pad = Math.max(0, Math.floor((maxLen - q.length) / 2));
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + q.length + pad);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}
