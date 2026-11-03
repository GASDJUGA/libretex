import { afterEach, describe, expect, it, vi } from "vitest";
import type { DropEvent } from "./tauri";
import { LEAVE_AFTER_MS, fileDrops } from "./windowsDrop";

/** A drag event with a minimal `dataTransfer` (jsdom has neither). */
function drag(
  type: "dragover" | "drop",
  types: string[],
  options: { x?: number; y?: number; files?: File[]; handles?: unknown[] } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const files = options.files ?? [];
  const items = (options.handles ?? files).map((handle) => ({
    kind: "file",
    getAsFileSystemHandle: options.handles ? () => Promise.resolve(handle) : undefined,
  }));
  Object.assign(event, {
    clientX: options.x ?? 0,
    clientY: options.y ?? 0,
    dataTransfer: { types, files, items, dropEffect: "none" },
  });
  return event;
}

describe("archivos soltados desde el Explorador (Windows)", () => {
  afterEach(() => vi.useRealTimers());

  it("pasa lo soltado a WebView2 y avisa con las rutas que devuelve Rust", async () => {
    const post = vi.fn();
    const drops = fileDrops(window, post);
    const events: DropEvent[] = [];
    const stop = drops.subscribe((event) => events.push(event));

    const over = drag("dragover", ["Files"], { x: 10, y: 20 });
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(events.at(-1)).toEqual({ type: "over", x: 10, y: 20 });

    const folder = { kind: "directory", name: "figuras" };
    const drop = drag("drop", ["Files"], { x: 30, y: 40, handles: [folder] });
    // Nothing else in the page sees it (CodeMirror would paste the file's text).
    const below = vi.fn();
    document.body.addEventListener("drop", below);
    document.body.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(below).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith([folder]));

    drops.received(["C:\\Users\\ana\\figuras"]);
    expect(events.at(-1)).toEqual({
      type: "drop",
      x: 30,
      y: 40,
      paths: ["C:\\Users\\ana\\figuras"],
    });
    stop();
    document.body.removeEventListener("drop", below);
  });

  it("sin handles, pasa los File", async () => {
    const post = vi.fn();
    fileDrops(window, post);
    const file = new File(["x"], "a.png");
    window.dispatchEvent(drag("drop", ["Files"], { files: [file] }));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith([file]));
  });

  it("no toca los arrastres de la página (pestañas, árbol de archivos)", () => {
    const post = vi.fn();
    const drops = fileDrops(window, post);
    const listener = vi.fn();
    drops.subscribe(listener);
    const over = drag("dragover", ["application/x-libretex-tab"]);
    window.dispatchEvent(over);
    const drop = drag("drop", ["application/x-libretex-tab"]);
    window.dispatchEvent(drop);
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("los archivos salen de la ventana sin soltarse", () => {
    vi.useFakeTimers();
    const drops = fileDrops(window, vi.fn());
    const events: DropEvent[] = [];
    drops.subscribe((event) => events.push(event));
    window.dispatchEvent(drag("dragover", ["Files"]));
    vi.advanceTimersByTime(LEAVE_AFTER_MS / 2);
    window.dispatchEvent(drag("dragover", ["Files"]));
    vi.advanceTimersByTime(LEAVE_AFTER_MS / 2);
    expect(events.map((e) => e.type)).toEqual(["over", "over"]);
    vi.advanceTimersByTime(LEAVE_AFTER_MS);
    expect(events.at(-1)).toEqual({ type: "leave" });
  });
});
