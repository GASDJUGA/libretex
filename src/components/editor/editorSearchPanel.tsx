import type { EditorView, Panel } from "@codemirror/view";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { EditorSearchBar } from "./EditorSearchBar";

/** CodeMirror panel that renders the bar with React and redraws it on every update. */
export function editorSearchPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-search lt-search-panel";
  const root = createRoot(dom);
  let version = 0;
  const render = () => root.render(<EditorSearchBar view={view} version={++version} />);
  // Synchronously the first time: CodeMirror focuses the `main-field` input right after.
  flushSync(render);
  return {
    dom,
    top: true,
    // Once in the document: ready to type (Ctrl+F with the bar open focuses it too).
    mount: () => {
      const field = dom.querySelector<HTMLInputElement>("[main-field]");
      field?.focus();
      field?.select();
    },
    update: render,
    // Unmounting during CodeMirror's update would warn: after it.
    destroy: () => queueMicrotask(() => root.unmount()),
  };
}
