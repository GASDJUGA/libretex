import type { EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { replaceWord, type MisspelledWord } from "../../editor/spellcheck";
import { currentChecker, useSpell } from "../../store/spell";
import { ContextMenu, type MenuEntry } from "../common/Menu";

type SpellMenuProps = {
  view: EditorView;
  word: MisspelledWord;
  onClose: () => void;
};

/** Right click on a misspelled word: suggestions and «add to the dictionary». */
export function SpellMenu({ view, word, onClose }: SpellMenuProps) {
  const t = useT();
  const [checker] = useState(currentChecker);
  const [loaded, setLoaded] = useState<{ word: string; list: string[] } | null>(null);
  const suggestions = !checker ? [] : loaded?.word === word.word ? loaded.list : null;

  useEffect(() => {
    if (!checker) return;
    let cancelled = false;
    const done = (list: string[]) => {
      if (!cancelled) setLoaded({ word: word.word, list });
    };
    checker.suggest(word.word).then(done, () => done([]));
    return () => {
      cancelled = true;
    };
  }, [checker, word.word]);

  const entries: MenuEntry[] = [
    ...(suggestions === null
      ? [{ kind: "label" as const, label: t("spell.searching") }]
      : suggestions.length === 0
        ? [{ kind: "label" as const, label: t("spell.noSuggestions") }]
        : suggestions.map((s) => ({ label: s, onSelect: () => replaceWord(view, word, s) }))),
    { kind: "separator" },
    {
      label: t("spell.addWord", { word: word.word }),
      onSelect: () => {
        void useSpell.getState().addWord(word.word);
        view.focus();
      },
    },
  ];

  return (
    <ContextMenu
      x={word.x}
      y={word.y}
      label={t("spell.menu", { word: word.word })}
      entries={entries}
      onClose={onClose}
    />
  );
}
