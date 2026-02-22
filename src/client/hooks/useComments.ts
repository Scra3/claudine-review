import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewData, Comment, CreateComment } from "../../shared/types";
import {
  fetchComments,
  addComment as apiAddComment,
  updateComment as apiUpdateComment,
  deleteComment as apiDeleteComment,
  createSSEConnection,
} from "../api";

export function useComments(onDiffChanged?: () => void) {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Load initial comments
  useEffect(() => {
    fetchComments()
      .then((data) => {
        setReviewData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // SSE subscription
  useEffect(() => {
    const sse = createSSEConnection(
      (data) => setReviewData(data),
      onDiffChanged,
    );
    sseRef.current = sse;
    return () => sse.close();
  }, [onDiffChanged]);

  const saveComment = useCallback(async (draft: CreateComment) => {
    try {
      const updated = await apiAddComment(draft);
      setReviewData(updated);
    } catch (err) {
      setError(`Failed to save comment: ${(err as Error).message}`);
    }
  }, []);

  const resolveComment = useCallback(async (id: string) => {
    try {
      await apiUpdateComment(id, {
        status: "resolved",
        resolvedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(`Failed to resolve comment: ${(err as Error).message}`);
    }
  }, []);

  const reopenComment = useCallback(async (id: string) => {
    try {
      await apiUpdateComment(id, { status: "pending", resolvedAt: null });
    } catch (err) {
      setError(`Failed to reopen comment: ${(err as Error).message}`);
    }
  }, []);

  const replyToComment = useCallback(async (id: string, reply: string) => {
    try {
      await apiUpdateComment(id, { reply });
    } catch (err) {
      setError(`Failed to reply to comment: ${(err as Error).message}`);
    }
  }, []);

  const removeComment = useCallback(async (id: string) => {
    try {
      await apiDeleteComment(id);
    } catch (err) {
      setError(`Failed to delete comment: ${(err as Error).message}`);
    }
  }, []);

  const serverComments: Comment[] = reviewData?.comments ?? [];

  return {
    reviewData,
    serverComments,
    loading,
    error,
    saveComment,
    resolveComment,
    reopenComment,
    replyToComment,
    removeComment,
  };
}
