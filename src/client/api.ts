import type {
  DiffResponse,
  ReviewData,
  CreateComment,
  UpdateComment,
  Summary,
} from "../shared/types";

function getToken(): string {
  return (
    sessionStorage.getItem("claudine-review-token") ??
    new URLSearchParams(window.location.search).get("token") ??
    ""
  );
}

export function storeTokenFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    sessionStorage.setItem("claudine-review-token", token);
    history.replaceState(null, "", window.location.pathname);
  }
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

export async function addComment(
  comment: CreateComment,
): Promise<ReviewData> {
  const res = await fetch(apiUrl("/api/comments"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comment),
  });
  if (!res.ok) throw new Error(`Failed to add comment: ${res.statusText}`);
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

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/comments/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete comment: ${res.statusText}`);
}

export async function setSummary(summary: Summary): Promise<ReviewData> {
  const res = await fetch(apiUrl("/api/summary"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(summary),
  });
  if (!res.ok) throw new Error(`Failed to set summary: ${res.statusText}`);
  return res.json();
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
    } catch (err) {
      console.error("Failed to parse SSE comments-updated event:", err, "Raw data:", e.data);
    }
  });

  source.addEventListener("diff-changed", () => {
    onDiffChanged?.();
  });

  source.addEventListener("connected", () => {
    console.log("SSE connected");
  });

  return source;
}
