import { afterEach, beforeAll, describe, expect, it } from "vitest";

// pdf.js resets every text layer on each `keyup` and `selectionchange` of the document (so on
// every key typed in the editor). Re-appending their end marker each time made WebKit lay out
// all the rendered text layers again on every key: with ~10 pages of text, typing fell behind
// the keyboard. Patched in `patches/pdfjs-dist@6.4.299.patch`: a layer already at rest is not touched.

type ViewerLib = typeof import("pdfjs-dist/web/pdf_viewer.mjs");
let viewerLib: ViewerLib;

beforeAll(async () => {
  // jsdom has no 2D canvas; the text layer only asks for one to measure text.
  HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
  await import("pdfjs-dist/legacy/build/pdf.mjs");
  viewerLib = await import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
});

const viewport = {
  rotation: 0,
  scale: 1,
  rawDims: { pageWidth: 600, pageHeight: 800, pageX: 0, pageY: 0 },
};

async function renderedLayer() {
  const pdfPage = { streamTextContent: () => ({ items: [], styles: {}, lang: null }) };
  const builder = new viewerLib.TextLayerBuilder({ pdfPage } as never);
  await builder.render({ viewport } as never);
  document.body.append(builder.div);
  return builder;
}

const builders: { cancel(): void; div: HTMLElement }[] = [];
afterEach(() => {
  for (const b of builders.splice(0)) {
    b.cancel();
    b.div.remove();
  }
});

describe("capas de texto del PDF al escribir", () => {
  it("una capa en reposo no se modifica con cada tecla", async () => {
    for (let i = 0; i < 3; i++) builders.push(await renderedLayer());
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    for (const b of builders) {
      observer.observe(b.div, { childList: true, attributes: true, subtree: true });
    }

    for (let i = 0; i < 5; i++) {
      document.dispatchEvent(new Event("selectionchange"));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
    }
    await Promise.resolve();
    records.push(...observer.takeRecords());
    observer.disconnect();

    expect(records).toEqual([]);
  });

  it("al soltar el mouse se sigue quitando la selección de la capa", async () => {
    const b = await renderedLayer();
    builders.push(b);
    b.div.classList.add("selecting");
    const end = b.div.querySelector(".endOfContent") as HTMLElement;
    b.div.prepend(end);
    end.style.width = "10px";

    document.dispatchEvent(new Event("pointerup"));

    expect(b.div.classList.contains("selecting")).toBe(false);
    expect(b.div.lastChild).toBe(end);
    expect(end.style.width).toBe("");
  });
});
