import React, { useState, useCallback, useEffect } from "react";
import { useDiff } from "./hooks/useDiff";
import { useComments } from "./hooks/useComments";
import { ReviewHeader } from "./components/ReviewHeader";
import { FileList } from "./components/FileList";
import { DiffView } from "./components/DiffView";
import { getFileName } from "./utils";
import { storeTokenFromUrl } from "./api";
import "./styles.css";

storeTokenFromUrl();

export default function App() {
  const { diff, loading: diffLoading, error: diffError, diffChanged, notifyDiffChanged, refreshDiff } = useDiff();
  const {
    reviewData,
    serverComments,
    loading: commentsLoading,
    error: commentsError,
    saveComment,
    resolveComment,
    reopenComment,
    replyToComment,
    removeComment,
  } = useComments(notifyDiffChanged);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  // Auto-select first file
  useEffect(() => {
    if (diff && diff.files.length > 0 && !selectedFile) {
      setSelectedFile(getFileName(diff.files[0]));
    }
  }, [diff, selectedFile]);

  const handleMarkViewed = useCallback((file: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const files = diff?.files ?? [];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in textarea/input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;

      const currentIdx = files.findIndex(
        (f) => getFileName(f) === selectedFile,
      );

      switch (e.key) {
        case "j": {
          // Next file
          const next = Math.min(currentIdx + 1, files.length - 1);
          if (files[next]) setSelectedFile(getFileName(files[next]));
          break;
        }
        case "k": {
          // Prev file
          const prev = Math.max(currentIdx - 1, 0);
          if (files[prev]) setSelectedFile(getFileName(files[prev]));
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [diff, selectedFile]);

  if (diffLoading || commentsLoading) {
    return (
      <div className="app app--loading">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  if (diffError) {
    return (
      <div className="app app--error">
        <div className="error-state">
          <h2>Error loading diff</h2>
          <p>{diffError}</p>
        </div>
      </div>
    );
  }

  if (!diff || diff.files.length === 0) {
    return (
      <div className="app app--empty">
        <div className="empty-state">
          <h2>No changes to review</h2>
          <p>There are no uncommitted changes in this repository.</p>
        </div>
      </div>
    );
  }

  const selectedDiffFile =
    diff.files.find((f) => getFileName(f) === selectedFile) ?? null;

  return (
    <div className="app">
      <ReviewHeader
        reviewData={reviewData}
        fileCount={diff.files.length}
        totalAdditions={diff.totalAdditions}
        totalDeletions={diff.totalDeletions}
      />
      {diffChanged && (
        <div className="diff-changed-banner">
          <span>Files have been changed since you last viewed them.</span>
          <button className="diff-changed-banner__btn" onClick={refreshDiff}>
            Refresh
          </button>
        </div>
      )}
      <div className="app__body">
        <FileList
          files={diff.files}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          comments={serverComments}
          viewedFiles={viewedFiles}
          filter={filter}
          onFilterChange={setFilter}
        />
        <main className="app__main">
          <DiffView
            file={selectedDiffFile}
            comments={serverComments.filter(
              (c) => c.file === selectedFile,
            )}
            onSaveComment={saveComment}
            onResolve={resolveComment}
            onReopen={reopenComment}
            onReply={replyToComment}
            onDelete={removeComment}
            onMarkViewed={handleMarkViewed}
            isViewed={selectedFile ? viewedFiles.has(selectedFile) : false}
          />
        </main>
      </div>
      {(diffError || commentsError) && (
        <div className="error-banner">
          {diffError || commentsError}
        </div>
      )}
      <footer className="app__footer">
        <span>j/k: files</span>
        <span>⌘Enter: comment</span>
        <span>Esc: cancel</span>
      </footer>
    </div>
  );
}
