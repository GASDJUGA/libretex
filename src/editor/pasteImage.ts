/**
 * Ctrl+V with no text on the clipboard: maybe an image (a screenshot). WebKitGTK gives the
 * page's paste event no image data, so `onImage` asks Rust to read the clipboard (on macOS
 * and Windows too: the bytes never travel through the webview).
 *
 * "Text" is what CodeMirror would paste: an image copied from a web page also brings
 * `text/html`, which CodeMirror ignores, so it still counts as an image.
 */
import { EditorView } from "@codemirror/view";

/** The types CodeMirror pastes as text. */
const PASTED_AS_TEXT = new Set(["text/plain", "text/uri-list"]);

export function pasteImage(onImage: (view: EditorView) => void) {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const types = event.clipboardData?.types ?? [];
      if (types.some((type) => PASTED_AS_TEXT.has(type))) return false;
      event.preventDefault();
      onImage(view);
      return true;
    },
  });
}
