import React, { useState } from "react";
import type { Comment } from "../../shared/types";

interface ServerCommentProps {
  comment: Comment;
  onResolve?: (id: string) => void;
  onReopen?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (id: string, reply: string) => void;
}

export function ServerCommentBubble({
  comment,
  onResolve,
  onReopen,
  onDelete,
  onReply,
}: ServerCommentProps) {
  const statusClass = `comment-bubble--${comment.status}`;
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");

  const handleSubmitReply = () => {
    if (!replyText.trim() || !onReply) return;
    onReply(comment.id, replyText.trim());
    setReplyText("");
    setReplying(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmitReply();
    }
    if (e.key === "Escape") {
      setReplying(false);
      setReplyText("");
    }
  };

  return (
    <div className={`comment-bubble ${statusClass}`}>
      <div className="comment-bubble__header">
        <span className="comment-bubble__badge">
          {comment.status === "resolved" ? "RESOLVED \u2713" : comment.status.toUpperCase()}
        </span>
        <span className="comment-bubble__location">
          {comment.file}:{comment.line}
        </span>
      </div>
      <div className="comment-bubble__body">{comment.body}</div>
      {comment.thread.map((entry, i) => {
        const isAI = entry.author === "ai";
        const prefix = isAI ? "response" : "user-reply";
        return (
          <div key={i} className={`comment-bubble__${prefix}`}>
            <div className={`comment-bubble__${prefix}-label`}>
              {isAI ? "Claude" : "You"}
            </div>
            <div className={`comment-bubble__${prefix}-body`}>
              {entry.body}
            </div>
          </div>
        );
      })}
      {replying && (
        <div className="comment-bubble__reply-form">
          <textarea
            className="comment-bubble__reply-textarea"
            placeholder="Write a reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="comment-bubble__reply-actions">
            <button
              className="comment-bubble__btn comment-bubble__btn--cancel"
              onClick={() => { setReplying(false); setReplyText(""); }}
            >
              Cancel
            </button>
            <button
              className="comment-bubble__btn comment-bubble__btn--send"
              onClick={handleSubmitReply}
              disabled={!replyText.trim()}
            >
              Reply
            </button>
          </div>
        </div>
      )}
      <div className="comment-bubble__actions">
        {comment.status === "pending" && onReply && !replying && (
          <button
            className="comment-bubble__btn comment-bubble__btn--reply"
            onClick={() => setReplying(true)}
          >
            Reply
          </button>
        )}
        {comment.status === "pending" && onResolve && (
          <button
            className="comment-bubble__btn comment-bubble__btn--resolve"
            onClick={() => onResolve(comment.id)}
          >
            Resolve
          </button>
        )}
        {comment.status === "resolved" && onReopen && (
          <button
            className="comment-bubble__btn comment-bubble__btn--reopen"
            onClick={() => onReopen(comment.id)}
          >
            Reopen
          </button>
        )}
        {onDelete && (
          <button
            className="comment-bubble__btn comment-bubble__btn--delete"
            onClick={() => onDelete(comment.id)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

