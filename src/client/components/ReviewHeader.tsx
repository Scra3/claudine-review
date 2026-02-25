import React, { useRef, useEffect } from "react";
import type { ReviewData } from "../../shared/types";
import type { Theme } from "../theme";

interface Props {
  reviewData: ReviewData | null;
  project: string;
  branch: string;
  fileCount: number;
  totalAdditions: number;
  totalDeletions: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function ReviewHeader({
  reviewData,
  project,
  branch,
  fileCount,
  totalAdditions,
  totalDeletions,
  searchQuery,
  onSearchChange,
  theme,
  onToggleTheme,
}: Props) {
  const round = reviewData?.round ?? 1;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || target.isContentEditable) return;

      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onSearchChange("");
      inputRef.current?.blur();
    }
  }

  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const SunIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 1A5 5 0 1 1 8 3a5 5 0 0 1 0 10Zm0-12a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 1Zm0 12a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 13Zm7-5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1 0-1h1a.5.5 0 0 1 .5.5ZM3 8a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1 0-1h1A.5.5 0 0 1 3 8Zm9.95-3.536a.5.5 0 0 1-.707 0l-.708-.707a.5.5 0 1 1 .708-.708l.707.708a.5.5 0 0 1 0 .707ZM4.464 12.243a.5.5 0 0 1-.707 0l-.708-.707a.5.5 0 0 1 .708-.708l.707.708a.5.5 0 0 1 0 .707Zm8.486 0a.5.5 0 0 1-.707-.707l.707-.708a.5.5 0 0 1 .708.708l-.708.707ZM4.464 4.464a.5.5 0 0 1-.707-.707l.707-.708a.5.5 0 1 1 .708.708l-.708.707Z" />
    </svg>
  );

  const MoonIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278Z" />
    </svg>
  );

  return (
    <header className="review-header">
      <div className="review-header__left">
        <span className="review-header__logo">claudine-review</span>
        {project && <span className="review-header__badge review-header__badge--project">{project}</span>}
        {branch && <span className="review-header__badge review-header__badge--branch">{branch}</span>}
        <span className="review-header__badge">Round {round}</span>
        <span className="review-header__stat">{fileCount} files</span>
        <span className="review-header__stat review-header__stat--add">
          +{totalAdditions}
        </span>
        <span className="review-header__stat review-header__stat--del">
          -{totalDeletions}
        </span>
      </div>
      <div className="review-header__right">
        <button
          className="review-header__theme-toggle"
          onClick={onToggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {theme === "dark" ? SunIcon : MoonIcon}
        </button>
        <input
          ref={inputRef}
          className="review-header__search"
          type="text"
          placeholder="Search diff & comments ( / )"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </header>
  );
}
