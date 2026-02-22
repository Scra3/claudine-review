import React from "react";
import type { DiffFile, Comment } from "../../shared/types";
import type { DraftComment } from "../hooks/useComments";

interface Props {
  files: DiffFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  comments: Comment[];
  drafts: DraftComment[];
  viewedFiles: Set<string>;
  filter: string;
  onFilterChange: (v: string) => void;
}

function getFileName(file: DiffFile): string {
  return file.to !== "/dev/null" ? file.to : file.from;
}

function getStatusIcon(file: DiffFile): string {
  if (file.new) return "A";
  if (file.deleted) return "D";
  if (file.renamed) return "R";
  return "M";
}

export function FileList({
  files,
  selectedFile,
  onSelectFile,
  comments,
  drafts,
  viewedFiles,
  filter,
  onFilterChange,
}: Props) {
  const filtered = files.filter((f) => {
    if (!filter) return true;
    const name = getFileName(f);
    return name.toLowerCase().includes(filter.toLowerCase());
  });

  const viewedCount = files.filter((f) => viewedFiles.has(getFileName(f))).length;

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
          const commentCount =
            comments.filter((c) => c.file === name).length +
            drafts.filter((d) => d.file === name).length;
          const isSelected = name === selectedFile;

          return (
            <li
              key={name}
              className={`file-list__item ${isSelected ? "file-list__item--selected" : ""}`}
              onClick={() => onSelectFile(name)}
            >
              <span className={`file-list__status file-list__status--${getStatusIcon(file).toLowerCase()}`}>
                {getStatusIcon(file)}
              </span>
              <span className="file-list__name" title={name}>
                {name.split("/").pop()}
              </span>
              <span className="file-list__changes">
                <span className="file-list__add">+{file.additions}</span>
                <span className="file-list__del">-{file.deletions}</span>
              </span>
              {commentCount > 0 && (
                <span className="file-list__comments">💬{commentCount}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="file-list__footer">
        Reviewed {viewedCount}/{files.length}
      </div>
    </aside>
  );
}
