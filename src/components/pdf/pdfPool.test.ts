import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import {
  attachPdf,
  DEFAULT_PDF_BUDGET,
  detachPdf,
  fitInBudget,
  pdfBudget,
  pdfEntry,
  resetPdfPool,
  type PdfEntry,
  type PdfHandlers,
} from "./pdfPool";

/** Stand-in for the pdf.js controller: only what the pool uses. */
class FakeController {
  static bytes = 0;
  destroyed = false;
  detach() {}
  reattach() {}
  memoryBytes() {
    return FakeController.bytes;
  }
  async destroy() {
    this.destroyed = true;
  }
}

vi.mock("./pdfController", () => ({ PdfController: FakeController }));

const handlers: PdfHandlers = {
  onState: () => {},
  onFind: () => {},
  onInverseSync: () => {},
  onPlace: () => {},
};

/** The viewer of `id`, created and shown once, then left (as a tab switch does). */
async function visit(id: string) {
  const entry = pdfEntry(id);
  await entry.controller;
  attachPdf(entry, handlers);
  return entry;
}

/** Whether each viewer was let go (its controller destroyed). */
const dropped = (...entries: PdfEntry[]) =>
  Promise.all(
    entries.map(async (e) => ((await e.controller) as unknown as FakeController).destroyed),
  );

afterEach(() => resetPdfPool());

describe("PDFs de las pestañas en el fondo", () => {
  it("se guardan los usados más recientemente mientras quepan en la memoria asignada", async () => {
    resetPdfPool(100);
    FakeController.bytes = 40;
    const a = await visit("a");
    detachPdf(a);
    const b = await visit("b");
    detachPdf(b);
    const c = await visit("c");
    detachPdf(c);
    // On screen now: d. In the background c, b (80 bytes) fit; a does not.
    const d = await visit("d");
    fitInBudget();
    expect(await dropped(c, b, a)).toEqual([false, false, true]);
    // The one on screen is never dropped, and the one left last is always kept.
    FakeController.bytes = 1000;
    fitInBudget();
    expect(await dropped(d, c, b)).toEqual([false, false, true]);
  });

  it("la memoria asignada es una parte de la del equipo", async () => {
    setBackend({ ...createMockBackend(), totalMemory: async () => 16 * 1024 ** 3 });
    expect(pdfBudget()).toBe(DEFAULT_PDF_BUDGET);
    pdfEntry("a");
    await vi.waitFor(() => expect(pdfBudget()).toBeCloseTo(0.05 * 16 * 1024 ** 3));
  });
});
