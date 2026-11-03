/**
 * Files dropped from the Explorer, on Windows (see src-tauri/src/platform/webview2.rs). Tauri's
 * drop handler is off there so the page keeps HTML5 drag and drop (tabs, the file tree), and
 * the page takes the system's file drops itself: it stops WebView2 from opening the file and
 * CodeMirror from pasting its text, and posts the dropped files to WebView2, which hands their
 * paths to Rust. Rust sends them back with the `files-dropped` event.
 */
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DropEvent } from "./tauri";

/** The message Rust waits for (`platform/webview2.rs`). */
const MESSAGE = "libretex-files-dropped";
/** No `dragover` for this long (they come every ~50 ms while dragging): the files left. */
export const LEAVE_AFTER_MS = 200;

type Listener = (event: DropEvent) => void;

export type FileDrops = {
  subscribe(listener: Listener): () => void;
  /** Rust's answer: the paths of the last drop. */
  received(paths: string[]): void;
};

type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<unknown> };

/** Drags from the system over `target`; `post` hands the dropped files to WebView2. */
export function fileDrops(target: Window, post: (objects: unknown[]) => void): FileDrops {
  const listeners = new Set<Listener>();
  const emit = (event: DropEvent) => listeners.forEach((listener) => listener(event));
  let at = { x: 0, y: 0 };
  let leave: ReturnType<typeof setTimeout> | undefined;
  const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

  // Capturing on the window: before CodeMirror or anything else in the page sees them.
  target.addEventListener(
    "dragover",
    (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer!.dropEffect = "copy";
      clearTimeout(leave);
      leave = setTimeout(() => emit({ type: "leave" }), LEAVE_AFTER_MS);
      emit({ type: "over", x: event.clientX, y: event.clientY });
    },
    true,
  );
  target.addEventListener(
    "drop",
    (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(leave);
      at = { x: event.clientX, y: event.clientY };
      const transfer = event.dataTransfer!;
      const files = [...transfer.files];
      // Handles must be asked for during the event; a folder only comes as a handle.
      const handles = [...transfer.items]
        .filter((item) => item.kind === "file")
        .map((item: WithHandle) => item.getAsFileSystemHandle?.() ?? Promise.resolve(null));
      Promise.all(handles).then(
        (found) => {
          const usable = found.filter((handle) => handle !== null);
          post(usable.length > 0 ? usable : files);
        },
        () => post(files),
      );
    },
    true,
  );

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    received(paths) {
      if (paths.length > 0) emit({ type: "drop", ...at, paths });
    },
  };
}

type WebView2 = {
  postMessageWithAdditionalObjects(message: string, objects: unknown[]): void;
};

let installed: FileDrops | null = null;

/** Takes this window's file drops (once; at startup, so no file is ever opened by WebView2). */
export function windowsFileDrops(): FileDrops {
  if (installed) return installed;
  const webview = (window as { chrome?: { webview?: WebView2 } }).chrome?.webview;
  const drops = fileDrops(window, (objects) =>
    webview?.postMessageWithAdditionalObjects(MESSAGE, objects),
  );
  void getCurrentWebviewWindow().listen<string[]>("files-dropped", ({ payload }) =>
    drops.received(payload),
  );
  installed = drops;
  return drops;
}
