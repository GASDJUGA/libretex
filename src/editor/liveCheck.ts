import { forceLinting, linter, type Diagnostic } from "@codemirror/lint";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { checkLatex, type CheckProblem } from "../lib/latexCheck/check";

/** Replaces the diagnostics of the last compilation (they follow later edits). */
export const setCompileDiagnostics = StateEffect.define<readonly Diagnostic[]>();

const compileDiagnostics = StateField.define<readonly Diagnostic[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setCompileDiagnostics)) return effect.value;
    if (!tr.docChanged || value.length === 0) return value;
    return value.map((d) => {
      const from = tr.changes.mapPos(d.from);
      return { ...d, from, to: Math.max(from, tr.changes.mapPos(d.to, 1)) };
    });
  },
});

export type LiveCheckOptions = {
  /** Text shown for a problem (translated). */
  message: (problem: CheckProblem) => string;
  /** Label of the check in the tooltip. */
  source: string;
  /** Whether to check this file now (setting on, and a .tex file). */
  enabled: () => boolean;
};

/** Diagnostics for the structural problems of `text`. */
export function checkDiagnostics(text: string, options: LiveCheckOptions): Diagnostic[] {
  return checkLatex(text).map((problem) => ({
    from: problem.from,
    to: problem.to,
    severity: "error",
    message: options.message(problem),
    source: options.source,
  }));
}

/** Idle time after typing before checking again. */
export const LIVE_CHECK_DELAY_MS = 500;

/**
 * One linter for both sources of problems: the last compilation and the live check of the
 * text (braces, environments, math), which needs no compilation.
 */
export function liveCheck(options: LiveCheckOptions): Extension {
  return [
    compileDiagnostics,
    linter(
      (view) => [
        ...view.state.field(compileDiagnostics),
        ...(options.enabled() ? checkDiagnostics(view.state.doc.toString(), options) : []),
      ],
      {
        delay: LIVE_CHECK_DELAY_MS,
        needsRefresh: (update) =>
          update.transactions.some((tr) => tr.effects.some((e) => e.is(setCompileDiagnostics))),
      },
    ),
  ];
}

/** Shows new compilation diagnostics right away. */
export function showCompileDiagnostics(view: EditorView, diagnostics: readonly Diagnostic[]) {
  view.dispatch({ effects: setCompileDiagnostics.of(diagnostics) });
  forceLinting(view);
}
