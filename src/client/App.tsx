import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useDiff } from "./hooks/useDiff";
import { useComments } from "./hooks/useComments";
import { ReviewHeader } from "./components/ReviewHeader";
import { SummaryPanel } from "./components/SummaryPanel";
import { SearchPanel, type SearchResult } from "./components/SearchPanel";
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

  const fileStats = useMemo(() => {
    const map: Record<string, { total: number; resolved: number }> = {};
    for (const c of serverComments) {
      if (!map[c.file]) map[c.file] = { total: 0, resolved: 0 };
      map[c.file].total += 1;
      if (c.status === "resolved") map[c.file].resolved += 1;
    }
    return map;
  }, [serverComments]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollToLine, setScrollToLine] = useState<{ line: number; side: string; token: number } | null>(null);
  const scrollTokenRef = useRef(0);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !diff) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const file of diff.files) {
      const name = getFileName(file);
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.content.toLowerCase().includes(q)) {
            const line = change.type === "del" ? change.ln : (change.ln2 ?? change.ln);
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

    for (const c of serverComments) {
      const bodies = [c.body, ...c.thread.map((t) => t.body)];
      for (const body of bodies) {
        if (body.toLowerCase().includes(q)) {
          results.push({ type: "comment", file: c.file, line: c.line, side: "new", snippet: body, commentId: c.id });
        }
      }
    }

    return results;
  }, [searchQuery, diff, serverComments]);

  const handleSearchNavigate = useCallback((file: string, line: number, side: string) => {
    setSelectedFile(file);
    scrollTokenRef.current += 1;
    setScrollToLine({ line, side, token: scrollTokenRef.current });
  }, []);

  // Auto-select first file
  useEffect(() => {
    if (diff && diff.files.length > 0 && !selectedFile) {
      setSelectedFile(getFileName(diff.files[0]));
    }
  }, [diff, selectedFile]);

  // Set document title with project and branch
  useEffect(() => {
    if (diff?.project) {
      document.title = `${diff.project} @ ${diff.branch} — claude-review`;
    }
  }, [diff?.project, diff?.branch]);

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
        project={diff.project ?? ""}
        branch={diff.branch ?? ""}
        fileCount={diff.files.length}
        totalAdditions={diff.totalAdditions}
        totalDeletions={diff.totalDeletions}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      {diffChanged && (
        <div className="diff-changed-banner">
          <span>Files have been changed since you last viewed them.</span>
          <button className="diff-changed-banner__btn" onClick={refreshDiff}>
            Refresh
          </button>
        </div>
      )}
      {reviewData?.summary != null && (
        <SummaryPanel key={`${reviewData.round}-${reviewData.summary.testPlan.length}`} summary={reviewData.summary} />
      )}
      {searchQuery.trim() && (
        <SearchPanel
          results={searchResults}
          query={searchQuery}
          onNavigate={handleSearchNavigate}
          onClose={() => setSearchQuery("")}
        />
      )}
      <div className="app__body">
        <FileList
          files={diff.files}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          fileStats={fileStats}
          viewedFiles={viewedFiles}
          filter={filter}
          onFilterChange={setFilter}
          fileSummaries={reviewData?.summary?.files ?? {}}
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
            fileSummary={selectedFile ? reviewData?.summary?.files?.[selectedFile] : undefined}
            scrollToLine={scrollToLine}
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
        <span>/: search</span>
        <span>⌘Enter: comment</span>
        <span>Esc: cancel</span>
      </footer>
    </div>
  );
}
