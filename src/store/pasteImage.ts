import type { EditorView } from "@codemirror/view";
import { create } from "zustand";
import { imageSpec } from "../editor/figure";
import { notifyError } from "../lib/errors";
import { getBackend, type ClipboardImage } from "../lib/tauri";
import { useProjects } from "./projects";

/**
 * Pasting an image (pedido del usuario: una captura de pantalla). Ctrl+V without text in the
 * editor asks Rust for the clipboard's image; if there is one, a dialog asks its name, then
 * it is saved in the project's figures folder and inserted as a figure.
 */
type PasteImageState = {
  /** The image waiting for a name, and the editor it goes into. */
  pending: { image: ClipboardImage; view: EditorView; seq: number } | null;
  /** Ctrl+V with no text in `view`. */
  start: (view: EditorView) => Promise<void>;
  /** Saves it as `name` (already safe for LaTeX) and inserts it; throws if it can't. */
  save: (name: string) => Promise<void>;
  cancel: () => void;
};

let pastes = 0;

export const usePasteImage = create<PasteImageState>()((set, get) => ({
  pending: null,
  start: async (view) => {
    try {
      const image = await getBackend().readClipboardImage();
      if (image && view.dom.isConnected) set({ pending: { image, view, seq: ++pastes } });
    } catch (error) {
      notifyError(error);
    }
  },
  save: async (name) => {
    const { pending } = get();
    const project = useProjects.getState().current;
    if (!pending || !project) return;
    const path = await getBackend().saveClipboardImage(project.id, name);
    set({ pending: null });
    // The editor may have closed meanwhile (the file is saved anyway).
    if (!pending.view.dom.isConnected) return;
    pending.view.dispatch(imageSpec(pending.view.state, path));
    pending.view.focus();
  },
  cancel: () => {
    const { pending } = get();
    set({ pending: null });
    void getBackend()
      .discardClipboardImage()
      .catch(() => {});
    if (pending?.view.dom.isConnected) pending.view.focus();
  },
}));
