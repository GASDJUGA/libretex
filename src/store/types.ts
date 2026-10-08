export type Compiler = "pdflatex" | "xelatex" | "lualatex";

export type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  /** ISO 8601 local date-time. */
  modifiedAt: string;
  compiler: Compiler;
};
