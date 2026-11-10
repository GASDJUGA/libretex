/**
 * While its window is not the active one, the editor gives up the page focus, and gets it
 * back when the window is active again.
 *
 * WebKitGTK collapses a page's selection when another window or app takes the PRIMARY
 * selection (what middle click pastes). CodeMirror, still holding the page focus in the
 * inactive window, then wrote its selection back to the page, which took PRIMARY back. With
 * two LibreTeX windows, each one took it from the other on every mouse move: the selection
 * being made flickered between all and nothing (pedido del usuario). Without the page focus,
 * CodeMirror leaves the page's selection alone; its own selection is still drawn.
 */
import { ViewPlugin, type EditorView } from "@codemirror/view";

export const inactiveWindow = ViewPlugin.fromClass(
  class {
    /** The editor had the page focus when its window stopped being the active one. */
    hadFocus = false;

    constructor(readonly view: EditorView) {
      window.addEventListener("blur", this.onBlur);
      window.addEventListener("focus", this.onFocus);
    }

    // Registered without capture: an element's blur or focus (which don't bubble) never gets here.
    onBlur = () => {
      const { contentDOM } = this.view;
      if (document.hasFocus() || document.activeElement !== contentDOM) return;
      this.hadFocus = true;
      contentDOM.blur();
    };

    onFocus = () => {
      if (!this.hadFocus) return;
      this.hadFocus = false;
      // Unless something else took the focus meanwhile (a click on another control).
      const active = document.activeElement;
      if (active && active !== document.body) return;
      // Puts CodeMirror's selection back on the page too.
      this.view.focus();
    };

    destroy() {
      window.removeEventListener("blur", this.onBlur);
      window.removeEventListener("focus", this.onFocus);
    }
  },
);
