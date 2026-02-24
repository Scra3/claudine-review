import React, { useRef, useEffect } from "react";
import type { ReviewData } from "../../shared/types";

interface Props {
  reviewData: ReviewData | null;
  project: string;
  branch: string;
  fileCount: number;
  totalAdditions: number;
  totalDeletions: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
