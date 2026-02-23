import { useMemo } from "react";
import type { DiffFile } from "../../shared/types";
import { getFileName, getFileStatus } from "../utils";

interface Props {
  files: DiffFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  fileStats: Record<string, { total: number; resolved: number }>;
  viewedFiles: Set<string>;
  filter: string;
  onFilterChange: (v: string) => void;
  fileSummaries: Record<string, string>;
}

export function FileList({
  files,
  selectedFile,
  onSelectFile,
  fileStats,
  viewedFiles,
  filter,
  onFilterChange,
  fileSummaries,
}: Props) {
  const filtered = files.filter((f) => {
    if (!filter) return true;
    const name = getFileName(f);
    return name.toLowerCase().includes(filter.toLowerCase());
  });

  const viewedCount = files.filter((f) => viewedFiles.has(getFileName(f))).length;

  const { totalComments, totalResolved } = useMemo(() => {
    let total = 0;
    let resolved = 0;
    for (const f of Object.values(fileStats)) {
      total += f.total;
      resolved += f.resolved;
    }
    return { totalComments: total, totalResolved: resolved };
  }, [fileStats]);

  return (
    <aside className="file-list">
      <div className="file-list__filter">
        <input
          type="text"
          placeholder="filter..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="file-list__input"
        />
      </div>
      <ul className="file-list__items">
        {filtered.map((file) => {
          const name = getFileName(file);
          const stats = fileStats[name];
          const isSelected = name === selectedFile;
          const isViewed = viewedFiles.has(name);

          const fileSummary = fileSummaries[name];

          return (
            <li
              key={name}
              className={["file-list__item", isSelected && "file-list__item--selected", isViewed && "file-list__item--viewed"].filter(Boolean).join(" ")}
              onClick={() => onSelectFile(name)}
            >
              <span className={`file-list__status ${isViewed ? "file-list__status--viewed" : `file-list__status--${getFileStatus(file).toLowerCase()}`}`}>
                {isViewed ? "\u2713" : getFileStatus(file)}
              </span>
              <span className="file-list__name-col">
                <span className="file-list__name" title={name}>
                  {name.split("/").pop()}
                </span>
                {fileSummary && (
                  <span className="file-list__summary" title={fileSummary}>
                    {fileSummary}
                  </span>
                )}
              </span>
              <span className="file-list__changes">
                <span className="file-list__add">+{file.additions}</span>
                <span className="file-list__del">-{file.deletions}</span>
              </span>
              {stats?.total > 0 && (
                <span
                  className={["file-list__comments", stats.resolved === stats.total && "file-list__comments--done"].filter(Boolean).join(" ")}
                  title={`${stats.resolved} of ${stats.total} resolved`}
                >
                  {stats.resolved}/{stats.total}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="file-list__footer">
        <span className={["file-list__footer-stat", viewedCount === files.length && "file-list__footer-stat--done"].filter(Boolean).join(" ")}>
          Reviewed {viewedCount}/{files.length}
        </span>
        {totalComments > 0 && (
          <span className={["file-list__footer-stat", totalResolved === totalComments && "file-list__footer-stat--done"].filter(Boolean).join(" ")}>
            {totalResolved}/{totalComments} resolved
          </span>
        )}
      </div>
    </aside>
  );
}
