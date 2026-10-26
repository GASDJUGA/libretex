/**
 * Ctrl+V with no text on the clipboard: maybe an image (a screenshot). WebKitGTK gives the
 * page's paste event no image data, so `onImage` asks Rust to read the clipboard.
 */
import { EditorView } from "@codemirror/view";

export function pasteImage(onImage: (view: EditorView) => void) {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const types = event.clipboardData?.types ?? [];
      if (types.some((type) => type.startsWith("text/"))) return false;
      event.preventDefault();
      onImage(view);
      return true;
    },
  });
}
