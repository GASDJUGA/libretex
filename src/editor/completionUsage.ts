import {
  insertCompletionText,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { Facet } from "@codemirror/state";

/**
 * Memory of the completions chosen in each project (pedido del usuario): what is picked more
 * often comes higher in the list for that document. Counts live in the browser storage of
 * the app, per project, like the session memory.
 */

/** The project whose memory the editor uses (`null`: none). */
export const completionProject = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

/** Most labels remembered per project (the least used are forgotten). */
const MAX_LABELS = 300;
const SAVE_DELAY = 1000;
/** Largest boost: below the math/text one (±50) and a typed-in-full match (+100). */
export const MAX_USAGE_BOOST = 30;

const storageKey = (project: string) => `libretex:${project}:completions`;
const cache = new Map<string, Map<string, number>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function counts(project: string): Map<string, number> {
  let map = cache.get(project);
  if (map) return map;
  map = new Map();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(project)) ?? "{}");
    if (stored && typeof stored === "object") {
      for (const [label, n] of Object.entries(stored)) {
        if (typeof n === "number" && n > 0) map.set(label, n);
      }
    }
  } catch {
    // Unreadable: start again.
  }
  cache.set(project, map);
  return map;
}

function save(project: string) {
  clearTimeout(timers.get(project));
  timers.set(
    project,
    setTimeout(() => {
      const map = counts(project);
      const kept = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LABELS);
      try {
        localStorage.setItem(storageKey(project), JSON.stringify(Object.fromEntries(kept)));
      } catch {
        // Not remembered: it still works in this session.
      }
    }, SAVE_DELAY),
  );
}

/** One more use of `label` in `project`. */
export function recordCompletion(project: string, label: string) {
  const map = counts(project);
  map.set(label, (map.get(label) ?? 0) + 1);
  save(project);
}

/** How much `label` goes up for its uses: 1 use +8, 2 +14, 4 +20… up to +30. */
export function usageBoost(project: string | null, label: string): number {
  if (!project) return 0;
  const n = counts(project).get(label) ?? 0;
  if (n === 0) return 0;
  return Math.min(MAX_USAGE_BOOST, Math.round(8 + 6 * Math.log2(n)));
}

/**
 * A source whose options go up by their uses in the editor's project; choosing one counts
 * as a use (also for options applied by a function, which do not mark the transaction).
 */
export function withUsageBoost(source: CompletionSource): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const result = await source(context);
    const project = context.state.facet(completionProject);
    if (!result || !project) return result;
    return {
      ...result,
      options: result.options.map((option): Completion => {
        const boost = usageBoost(project, option.label);
        const apply = option.apply ?? option.label;
        return {
          ...option,
          boost: (option.boost ?? 0) + boost,
          apply: (view, completion, from, to) => {
            recordCompletion(project, option.label);
            if (typeof apply === "function") {
              apply(view, completion, from, to);
              return;
            }
            view.dispatch({
              ...insertCompletionText(view.state, apply, from, to),
              annotations: pickedCompletion.of(completion),
              userEvent: "input.complete",
            });
          },
        };
      }),
    };
  };
}

/** For tests: forget the memory in this session. */
export function resetCompletionUsage() {
  cache.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
