import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useDiff } from "./hooks/useDiff";
import { useComments } from "./hooks/useComments";
import { ReviewHeader } from "./components/ReviewHeader";
import { SummaryPanel } from "./components/SummaryPanel";
import { SearchPanel } from "./components/SearchPanel";
import { buildSearchResults } from "./search";
import { FileList } from "./components/FileList";
import { DiffView } from "./components/DiffView";
import { getFileName } from "./utils";
import { loadSidebarWidth, saveSidebarWidth, clampSidebarWidth, SIDEBAR_MIN } from "./sidebar";
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

  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { dragCleanupRef.current?.(); };
  }, []);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setResizing(true);

    let lastWidth = 0;

    const onPointerMove = (ev: PointerEvent) => {
      lastWidth = clampSidebarWidth(ev.clientX, window.innerWidth);
      setSidebarWidth(lastWidth);
    };

    const cleanup = () => {
      setResizing(false);
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("lostpointercapture", onLostCapture);
      dragCleanupRef.current = null;
    };

    const onPointerUp = () => {
      cleanup();
      if (lastWidth > 0) {
        saveSidebarWidth(lastWidth);
      }
    };

    const onLostCapture = () => cleanup();

    dragCleanupRef.current = cleanup;
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("lostpointercapture", onLostCapture);
  }, []);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollToLine, setScrollToLine] = useState<{ line: number; side: string; token: number } | null>(null);
  const scrollTokenRef = useRef(0);

  const searchResults = useMemo(
    () => diff ? buildSearchResults(searchQuery, diff.files, serverComments) : [],
    [searchQuery, diff, serverComments],
  );

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
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || target.isContentEditable) return;

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
          style={{ width: sidebarWidth }}
        />
        <div
          className={`resize-handle${resizing ? " resize-handle--active" : ""}`}
          onPointerDown={handleResizePointerDown}
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
