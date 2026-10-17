/**
 * Hunspell checking with nspell: what the spell-check worker runs (and the tests, directly).
 */
import nspell from "nspell";

export type Speller = {
  /** The words of `words` that are not correct. */
  wrong(words: string[]): string[];
  suggest(word: string): string[];
  /** The personal dictionary's words are correct too. */
  add(words: string[]): void;
  remove(words: string[]): void;
};

/** Most suggestions offered for a word. */
export const MAX_SUGGESTIONS = 6;

const base = (c: string) => c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * How far `b` is from `a` for a typist: edit distance where swapping two neighbours or
 * changing only an accent or the case costs less than other mistakes.
 */
export function typingDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const same = x[i - 1] === y[j - 1];
      const substitution = same ? 0 : base(x[i - 1]) === base(y[j - 1]) ? 0.25 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + substitution);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 0.5);
      }
    }
  }
  return d[x.length][y.length];
}

/** nspell's suggestions, closest first (it lists them in no useful order). */
export function rankSuggestions(word: string, suggestions: string[]): string[] {
  return suggestions
    .map((s, index) => ({ s, index, cost: typingDistance(word, s) }))
    .sort((p, q) => p.cost - q.cost || p.index - q.index)
    .map((p) => p.s)
    .slice(0, MAX_SUGGESTIONS);
}

export function createSpeller(aff: string, dic: string): Speller {
  const spell = nspell(aff, dic);
  return {
    wrong: (words) => words.filter((w) => !spell.correct(w)),
    suggest: (word) => rankSuggestions(word, spell.suggest(word)),
    add: (words) => words.forEach((w) => spell.add(w)),
    remove: (words) => words.forEach((w) => spell.remove(w)),
  };
}
