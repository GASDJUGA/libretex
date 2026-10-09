import type { ProjectSummary } from "../../store/types";

export type ProjectSort = "recent" | "name" | "modified";

/** Case- and accent-insensitive form used for searching and sorting. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/**
 * Filters projects whose name or path contains every word of `query`
 * (ignoring case and accents) and sorts them.
 */
export function filterAndSortProjects(
  projects: readonly ProjectSummary[],
  query: string,
  sort: ProjectSort,
): ProjectSummary[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = projects.filter((p) => {
    const haystack = normalize(`${p.name} ${p.displayPath}`);
    return words.every((w) => haystack.includes(w));
  });

  const byName = (a: ProjectSummary, b: ProjectSummary) =>
    normalize(a.name).localeCompare(normalize(b.name));
  // Newest first; projects without a date go last.
  const byDate = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);
  const compare: Record<ProjectSort, (a: ProjectSummary, b: ProjectSummary) => number> = {
    recent: (a, b) => byDate(a.openedAt, b.openedAt) || byName(a, b),
    modified: (a, b) => byDate(a.modifiedAt, b.modifiedAt) || byName(a, b),
    name: byName,
  };
  return matches.sort(compare[sort]);
}
