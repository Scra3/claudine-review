import React from "react";
import type { ReviewData } from "../../shared/types";

interface Props {
  reviewData: ReviewData | null;
  fileCount: number;
  totalAdditions: number;
  totalDeletions: number;
  draftCount: number;
  onSubmit: () => void;
}

export function ReviewHeader({
  reviewData,
  fileCount,
  totalAdditions,
  totalDeletions,
  draftCount,
  onSubmit,
}: Props) {
  const round = reviewData?.round ?? 1;

  return (
    <header className="review-header">
      <div className="review-header__left">
        <span className="review-header__logo">claude-review</span>
        <span className="review-header__badge">Round {round}</span>
        <span className="review-header__stat">{fileCount} files</span>
        <span className="review-header__stat review-header__stat--add">
          +{totalAdditions}
        </span>
        <span className="review-header__stat review-header__stat--del">
          -{totalDeletions}
        </span>
        {draftCount > 0 && (
          <span className="review-header__stat review-header__stat--draft">
            {draftCount} draft{draftCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="review-header__right">
        <button
          className="review-header__submit"
          onClick={onSubmit}
          disabled={draftCount === 0}
        >
          Submit Review
        </button>
      </div>
    </header>
  );
}
