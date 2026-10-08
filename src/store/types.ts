export type Compiler = "pdflatex" | "xelatex" | "lualatex";

export type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  /** ISO 8601 local date-time of the last change on disk. */
  modifiedAt: string;
  /** ISO 8601 local date-time of the last time it was opened in LibreTeX. */
  openedAt: string;
  compiler: Compiler;
};
