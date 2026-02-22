import type {
  DiffResponse,
  ReviewData,
  CreateComment,
  UpdateComment,
} from "../shared/types";

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? "";
}

function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", getToken());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function fetchDiff(ref?: string): Promise<DiffResponse> {
  const params: Record<string, string> = {};
  if (ref) params.ref = ref;
  const res = await fetch(apiUrl("/api/diff", params));
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.statusText}`);
  return res.json();
}

export async function fetchFileContent(path: string): Promise<string> {
  const res = await fetch(apiUrl("/api/file", { path }));
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.statusText}`);
  return res.text();
}

export async function fetchComments(): Promise<ReviewData> {
  const res = await fetch(apiUrl("/api/comments"));
  if (!res.ok) throw new Error(`Failed to fetch comments: ${res.statusText}`);
  return res.json();
}

export async function submitReview(
  comments: CreateComment[],
): Promise<ReviewData> {
  const res = await fetch(apiUrl("/api/comments"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comments }),
  });
  if (!res.ok) throw new Error(`Failed to submit review: ${res.statusText}`);
  return res.json();
}

export async function updateComment(
  id: string,
  patch: UpdateComment,
): Promise<void> {
  const res = await fetch(apiUrl(`/api/comments/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update comment: ${res.statusText}`);
}

export async function replyToComment(id: string, reply: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/comments/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply }),
  });
  if (!res.ok) throw new Error(`Failed to reply to comment: ${res.statusText}`);
}

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/comments/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete comment: ${res.statusText}`);
}

export function createSSEConnection(
  onUpdate: (data: ReviewData) => void,
  onDiffChanged?: () => void,
): EventSource {
  const url = apiUrl("/sse");
  const source = new EventSource(url);

  source.addEventListener("comments-updated", (e) => {
    try {
      const data = JSON.parse(e.data);
      onUpdate(data);
    } catch { /* ignore parse errors */ }
  });

  source.addEventListener("diff-changed", () => {
    onDiffChanged?.();
  });

  source.addEventListener("connected", () => {
    console.log("SSE connected");
  });

  return source;
}
