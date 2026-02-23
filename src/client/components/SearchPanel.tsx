export interface SearchResult {
  type: "diff" | "comment";
  file: string;
  line: number;
  side: string;
  snippet: string;
  commentId?: string;
}

interface Props {
  results: SearchResult[];
  query: string;
  onNavigate: (file: string, line: number, side: string) => void;
  onClose: () => void;
}

function highlightMatch(text: string, query: string) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: (string | JSX.Element)[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(q, lastIdx);
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(<mark key={idx} className="search-highlight">{text.slice(idx, idx + query.length)}</mark>);
    lastIdx = idx + query.length;
    idx = lower.indexOf(q, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function truncateSnippet(text: string, query: string, maxLen = 120): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text.slice(0, maxLen);

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 40);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

export function SearchPanel({ results, query, onNavigate, onClose }: Props) {
  if (results.length === 0) {
    return (
      <div className="search-panel">
        <div className="search-panel__header">
          <span className="search-panel__count">No results for &ldquo;{query}&rdquo;</span>
          <button className="search-panel__close" onClick={onClose}>
            Clear
          </button>
        </div>
      </div>
    );
  }

  // Group results by file
  const grouped = new Map<string, SearchResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.file) ?? [];
    arr.push(r);
    grouped.set(r.file, arr);
  }

  return (
    <div className="search-panel">
      <div className="search-panel__header">
        <span className="search-panel__count">
          {results.length} result{results.length !== 1 ? "s" : ""} in {grouped.size} file{grouped.size !== 1 ? "s" : ""}
        </span>
        <button className="search-panel__close" onClick={onClose}>
          Clear
        </button>
      </div>
      <div className="search-panel__body">
        {[...grouped.entries()].map(([file, items]) => (
          <div key={file} className="search-panel__group">
            <div className="search-panel__file">{file}</div>
            {items.map((r, i) => (
              <button
                key={`${r.line}-${r.side}-${i}`}
                className="search-panel__result"
                onClick={() => onNavigate(r.file, r.line, r.side)}
              >
                <span className="search-panel__badge">
                  {r.type === "diff" ? `L${r.line}` : "comment"}
                </span>
                <span className="search-panel__snippet">
                  {highlightMatch(truncateSnippet(r.snippet, query), query)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
