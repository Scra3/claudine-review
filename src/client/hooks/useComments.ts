import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewData, Comment, CreateComment } from "../../shared/types";
import {
  fetchComments,
  submitReview as apiSubmitReview,
  updateComment as apiUpdateComment,
  replyToComment as apiReplyToComment,
  deleteComment as apiDeleteComment,
  createSSEConnection,
} from "../api";

export interface DraftComment {
  file: string;
  line: number;
  endLine?: number;
  side: "old" | "new";
  body: string;
}

export function useComments(onDiffChanged?: () => void) {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [loading, setLoading] = useState(true);
  const sseRef = useRef<EventSource | null>(null);

  // Load initial comments
  useEffect(() => {
    fetchComments()
      .then((data) => {
        setReviewData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  const addDraft = useCallback(
    (draft: DraftComment) => {
      setDrafts((prev) => [...prev, draft]);
    },
    [],
  );

  const removeDraft = useCallback((index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateDraft = useCallback(
    (index: number, body: string) => {
      setDrafts((prev) =>
        prev.map((d, i) => (i === index ? { ...d, body } : d)),
      );
    },
    [],
  );

  const submitReview = useCallback(async () => {
    if (drafts.length === 0) return;
    const comments: CreateComment[] = drafts.map((d) => ({
      file: d.file,
      line: d.line,
      endLine: d.endLine,
      side: d.side,
      body: d.body,
    }));
    const updated = await apiSubmitReview(comments);
    setReviewData(updated);
    setDrafts([]);
  }, [drafts]);

  const resolveComment = useCallback(async (id: string) => {
    await apiUpdateComment(id, {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
    });
  }, []);

  const reopenComment = useCallback(async (id: string) => {
    await apiUpdateComment(id, { status: "pending", resolvedAt: null });
  }, []);

  const replyToComment = useCallback(async (id: string, reply: string) => {
    await apiReplyToComment(id, reply);
  }, []);

  const removeComment = useCallback(async (id: string) => {
    await apiDeleteComment(id);
  }, []);

  const serverComments: Comment[] = reviewData?.comments ?? [];
  const pendingCount = serverComments.filter(
    (c) => c.status === "pending",
  ).length;
  const resolvedCount = serverComments.filter(
    (c) => c.status === "resolved",
  ).length;

  return {
    reviewData,
    serverComments,
    drafts,
    loading,
    pendingCount,
    resolvedCount,
    addDraft,
    removeDraft,
    updateDraft,
    submitReview,
    resolveComment,
    reopenComment,
    replyToComment,
    removeComment,
  };
}
