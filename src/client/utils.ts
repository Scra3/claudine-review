import type { DiffFile } from "../shared/types";

export function getFileName(file: DiffFile): string {
  return file.to !== "/dev/null" ? file.to : file.from;
}

export function getFileStatus(file: DiffFile): string {
  if (file.new) return "A";
  if (file.deleted) return "D";
  if (file.renamed) return "R";
  return "M";
}
