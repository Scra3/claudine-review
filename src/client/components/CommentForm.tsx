import React, { useState, useRef, useEffect } from "react";

interface Props {
  file: string;
  line: number;
  onSave: (body: string) => void;
  onCancel: () => void;
  initialBody?: string;
}

export function CommentForm({
  file,
  line,
  onSave,
  onCancel,
  initialBody = "",
}: Props) {
  const [body, setBody] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (body.trim()) onSave(body.trim());
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="comment-form">
      <div className="comment-form__header">
        <span className="comment-form__badge">DRAFT</span>
        <span className="comment-form__location">
          {file}:{line}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        className="comment-form__textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write a comment..."
        rows={3}
      />
      <div className="comment-form__actions">
        <button className="comment-form__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="comment-form__save"
          onClick={() => body.trim() && onSave(body.trim())}
          disabled={!body.trim()}
        >
          Save Draft
        </button>
      </div>
    </div>
  );
}
