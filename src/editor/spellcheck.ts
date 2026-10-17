/**
 * Spell checking in the editor: misspelled prose words get a wavy underline (commands,
 * math, comments and names are skipped, see lib/spell/words.ts) and a right click on one
 * offers suggestions. The dictionary lives in a worker; the document is rechecked a moment
 * after typing stops, with answers cached per word.
 */
import { StateEffect, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";
import type { SpellChecker } from "../lib/spell/checker";
import { proseWords } from "../lib/spell/words";

/** Pause after the last change before checking. */
export const SPELL_DELAY_MS = 300;

/** A misspelled word under a right click. */
export type MisspelledWord = { word: string; from: number; to: number; x: number; y: number };

export type SpellConfig = {
  /** The checker to use now, or null to check nothing (language «off», not a .tex). */
  checker: () => SpellChecker | null;
  /** Right click on a misspelled word (the browser's menu is not shown). */
  onMenu: (view: EditorView, word: MisspelledWord) => void;
};

/** Check again now (language or personal dictionary changed). */
export const recheckSpelling = StateEffect.define<null>();

const misspelled = Decoration.mark({ class: "cm-spell-error" });

class SpellPlugin implements PluginValue {
  decorations: DecorationSet = Decoration.none;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Increases with each check: an older one that finishes late is dropped. */
  private seq = 0;

  constructor(
    private readonly view: EditorView,
    private readonly config: SpellConfig,
  ) {
    this.schedule(0);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) this.decorations = this.decorations.map(update.changes);
    const recheck = update.transactions.some((tr) => tr.effects.some((e) => e.is(recheckSpelling)));
    if (recheck) this.schedule(0);
    // Moving away from a word just typed shows whether it is right.
    else if (update.docChanged || update.selectionSet) this.schedule(SPELL_DELAY_MS);
  }

  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.check(), delay);
  }

  private async check() {
    const seq = ++this.seq;
    const checker = this.config.checker();
    const { state } = this.view;
    if (!checker) {
      this.set(Decoration.none);
      return;
    }
    const doc = state.doc;
    const words = proseWords(doc.toString());
    let wrong: Set<string>;
    try {
      wrong = new Set(await checker.wrong(words.map((w) => w.word)));
    } catch {
      return; // The worker was replaced (language change): another check follows.
    }
    if (seq !== this.seq || this.view.state.doc !== doc) return;
    // The word being typed is not marked until the cursor leaves it.
    const head = this.view.state.selection.main.head;
    const ranges = words
      .filter((w) => wrong.has(w.word) && !(this.view.hasFocus && w.to === head))
      .map((w) => misspelled.range(w.from, w.to));
    this.set(Decoration.set(ranges));
  }

  private set(decorations: DecorationSet) {
    this.decorations = decorations;
    // Redraw with the new decorations (an empty transaction updates the plugin's view).
    this.view.dispatch({});
  }

  /** The misspelled word at `pos`, if any. */
  wordAt(pos: number): { from: number; to: number } | null {
    let found: { from: number; to: number } | null = null;
    this.decorations.between(pos, pos, (from, to) => {
      found = { from, to };
      return false;
    });
    return found;
  }

  destroy() {
    clearTimeout(this.timer);
    this.seq++;
  }
}

export function spellcheck(config: SpellConfig): Extension {
  const plugin = ViewPlugin.define((view) => new SpellPlugin(view, config), {
    decorations: (p) => p.decorations,
    eventHandlers: {
      contextmenu(event: MouseEvent, view: EditorView) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        const range = this.wordAt(pos);
        if (!range) return false;
        event.preventDefault();
        config.onMenu(view, {
          word: view.state.sliceDoc(range.from, range.to),
          ...range,
          x: event.clientX,
          y: event.clientY,
        });
        return true;
      },
    },
  });
  return [
    plugin,
    EditorView.baseTheme({
      ".cm-spell-error": {
        textDecoration: "underline wavy #e5484d",
        textDecorationSkipInk: "none",
        textUnderlineOffset: "3px",
      },
    }),
  ];
}

/** Replaces the misspelled word with a suggestion. */
export function replaceWord(view: EditorView, word: MisspelledWord, replacement: string) {
  if (view.state.sliceDoc(word.from, word.to) !== word.word) return;
  view.dispatch({
    changes: { from: word.from, to: word.to, insert: replacement },
    selection: { anchor: word.from + replacement.length },
    userEvent: "input.complete",
  });
  view.focus();
}
