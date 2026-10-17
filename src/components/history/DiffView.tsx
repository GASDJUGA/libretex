import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { latex } from "codemirror-lang-latex";
import { useEffect, useRef } from "react";
import { editorPhrases } from "../../editor/phrases";
import { editorTheme } from "../../editor/theme";
import { useI18n } from "../../i18n";

type DiffViewProps = {
  /** The file before the version (empty if it did not exist). */
  before: string;
  /** The file in the version. */
  after: string;
  /** LaTeX highlighting (for .tex files and the like). */
  latexSyntax: boolean;
};

/**
 * Read-only diff of a file: the version's text with what it added highlighted and what it
 * removed shown in between (unified view of @codemirror/merge); long unchanged stretches are
 * folded.
 */
export function DiffView({ before, after, latexSyntax }: DiffViewProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: after,
        extensions: [
          lineNumbers(),
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          editorTheme,
          editorPhrases(useI18n.getState().locale),
          latexSyntax
            ? latex({ enableLinting: false, enableTooltips: false, enableAutocomplete: false })
            : [],
          unifiedMergeView({
            original: before,
            mergeControls: false,
            collapseUnchanged: { margin: 3, minSize: 8 },
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [before, after, latexSyntax]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="history-diff" />;
}
