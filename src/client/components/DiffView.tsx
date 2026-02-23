import React, { useState, useCallback, useMemo, useEffect } from "react";
import type { DiffFile, DiffHunk, Comment, CreateComment } from "../../shared/types";
import { CommentForm } from "./CommentForm";
import { ServerCommentBubble } from "./CommentBubble";
import { getFileName, getFileStatus } from "../utils";

interface Props {
  file: DiffFile | null;
  comments: Comment[];
  onSaveComment: (comment: CreateComment) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onReply: (id: string, reply: string) => void;
  onDelete: (id: string) => void;
  onMarkViewed: (file: string) => void;
  isViewed: boolean;
  fileSummary?: string;
  scrollToLine?: { line: number; side: string } | null;
}

interface DiffLine {
  type: "add" | "del" | "normal" | "hunk-header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

const LINE_PREFIX: Record<DiffLine["type"], string> = {
  add: "+",
  del: "-",
  normal: " ",
  "hunk-header": "",
};

/** Unique key for a commentable line: "old:42" or "new:42" */
function lineKey(line: DiffLine): string {
  if (line.type === "del") return `old:${line.oldLine}`;
  return `new:${line.newLine ?? line.oldLine}`;
}

function buildLines(chunks: DiffHunk[]): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const chunk of chunks) {
    lines.push({ type: "hunk-header", content: chunk.content });
    let oldLine = chunk.oldStart;
    let newLine = chunk.newStart;
    for (const change of chunk.changes) {
      if (change.type === "normal") {
        lines.push({ type: "normal", content: change.content.slice(1), oldLine, newLine });
        oldLine++;
        newLine++;
      } else if (change.type === "del") {
        lines.push({ type: "del", content: change.content.slice(1), oldLine });
        oldLine++;
      } else if (change.type === "add") {
        lines.push({ type: "add", content: change.content.slice(1), newLine });
        newLine++;
      }
    }
  }
  return lines;
}

export function DiffView({
  file,
  comments,
  onSaveComment,
  onResolve,
  onReopen,
  onReply,
  onDelete,
  onMarkViewed,
  isViewed,
  fileSummary,
  scrollToLine,
}: Props) {
  // commentingKey = "old:42" | "new:10" | null
  const [commentingKey, setCommentingKey] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const fileName = file ? getFileName(file) : "";

  const lines = useMemo(
    () => (file ? buildLines(file.chunks) : []),
    [file],
  );

  useEffect(() => {
    if (!scrollToLine) return;
    const id = `L${scrollToLine.side}:${scrollToLine.line}`;
    let flashTimer: ReturnType<typeof setTimeout>;
    // Small delay to allow the DOM to render after file switch
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("diff-line--flash");
        flashTimer = setTimeout(() => el.classList.remove("diff-line--flash"), 1500);
      }
    }, 50);
    return () => {
      clearTimeout(timer);
      clearTimeout(flashTimer);
    };
  }, [scrollToLine]);

  const handleSaveComment = useCallback(
    (body: string) => {
      if (!commentingKey || !fileName) return;
      const [side, num] = commentingKey.split(":");
      onSaveComment({
        file: fileName,
        line: parseInt(num, 10),
        side: side as "old" | "new",
        body,
      });
      setCommentingKey(null);
    },
    [commentingKey, fileName, onSaveComment],
  );

  const fileComments = comments.filter((c) => c.file === fileName);

  // Index comments by key ("old:42" or "new:42")
  const commentsByKey = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of fileComments) {
      const key = `${c.side}:${c.line}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [fileComments]);

  if (!file) {
    return (
      <div className="diff-view diff-view--empty">
        <div className="diff-view__empty-state">
          <h2>No file selected</h2>
          <p>Select a file from the sidebar to review changes</p>
        </div>
      </div>
    );
  }

  const renderInlineComments = (key: string, displayLine: number) => {
    const lc = commentsByKey.get(key) ?? [];
    const isCommenting = commentingKey === key;
    if (!lc.length && !isCommenting) return null;

    return (
      <tr className="diff-comment-row">
        <td colSpan={3} className="diff-comment-cell">
          <div className="diff-comment-cell__inner">
            {lc.map((c) => (
              <ServerCommentBubble
                key={c.id}
                comment={c}
                onResolve={onResolve}
                onReopen={onReopen}
                onReply={onReply}
                onDelete={onDelete}
              />
            ))}
            {isCommenting && (
              <CommentForm
                file={fileName}
                line={displayLine}
                onSave={handleSaveComment}
                onCancel={() => setCommentingKey(null)}
              />
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="diff-view">
      <div className="diff-view__header">
        <span className="diff-view__filename">{fileName}</span>
        <span className="diff-view__badge">
          {getFileStatus(file)}
        </span>
        <span className="diff-view__stat diff-view__stat--add">
          +{file.additions}
        </span>
        <span className="diff-view__stat diff-view__stat--del">
          -{file.deletions}
        </span>
        <button
          className={`diff-view__viewed ${isViewed ? "diff-view__viewed--active" : ""}`}
          onClick={() => onMarkViewed(fileName)}
        >
          {isViewed ? "Viewed ✓" : "Mark as viewed"}
        </button>
        {fileSummary && (
          <div className="diff-view__summary">{fileSummary}</div>
        )}
      </div>

      <div className="diff-view__content">
        <table className="diff-table">
          <tbody>
            {lines.map((line, i) => {
              if (line.type === "hunk-header") {
                return (
                  <tr key={`hunk-${i}`} className="diff-line diff-line--hunk">
                    <td className="diff-gutter diff-gutter--hunk" colSpan={2}>···</td>
                    <td className="diff-code diff-code--hunk">{line.content}</td>
                  </tr>
                );
              }

              const key = lineKey(line);
              const displayLine = line.newLine ?? line.oldLine ?? 0;
              const isHovered = hoveredIdx === i;
              const hasStuff = commentsByKey.has(key);

              // Which gutter gets the "+" button?
              const isDel = line.type === "del";

              return (
                <React.Fragment key={`line-${i}`}>
                  <tr
                    id={`L${key}`}
                    className={`diff-line diff-line--${line.type}`}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Old line gutter */}
                    <td
                      className={`diff-gutter diff-gutter--old ${
                        isDel && (isHovered || hasStuff) ? "diff-gutter--active" : ""
                      }`}
                      onClick={isDel ? () => setCommentingKey(key) : undefined}
                    >
                      <span className="diff-gutter__line-num">
                        {line.oldLine ?? ""}
                      </span>
                      {isDel && (isHovered || hasStuff) && (
                        <span className="diff-gutter__add-btn">+</span>
                      )}
                    </td>

                    {/* New line gutter */}
                    <td
                      className={`diff-gutter diff-gutter--new ${
                        !isDel && (isHovered || hasStuff) ? "diff-gutter--active" : ""
                      }`}
                      onClick={!isDel ? () => setCommentingKey(key) : undefined}
                    >
                      <span className="diff-gutter__line-num">
                        {line.newLine ?? ""}
                      </span>
                      {!isDel && (isHovered || hasStuff) && (
                        <span className="diff-gutter__add-btn">+</span>
                      )}
                    </td>

                    {/* Code */}
                    <td className={`diff-code diff-code--${line.type}`}>
                      <span className="diff-code__prefix">
                        {LINE_PREFIX[line.type]}
                      </span>
                      <span className="diff-code__content">{line.content}</span>
                    </td>
                  </tr>
                  {renderInlineComments(key, displayLine)}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
