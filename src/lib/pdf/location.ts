/** Where the reader is: first visible page and the PDF point at the top-left of the view. */
export type PdfLocation = { pageNumber: number; left: number; top: number };

/**
 * Arguments for pdf.js's `scrollPageIntoView` that bring a new version of the document back
 * to `location`, keeping the current zoom (an «XYZ» destination with no zoom).
 */
export function restoreDestination(location: PdfLocation, pagesCount: number) {
  return {
    pageNumber: Math.min(Math.max(1, location.pageNumber), Math.max(1, pagesCount)),
    destArray: [null, { name: "XYZ" }, location.left, location.top, null],
    allowNegativeOffset: true,
    ignoreDestinationZoom: true,
  };
}

type Bus = {
  on(name: string, listener: (event: { pageNumber: number }) => void): void;
  off(name: string, listener: (event: { pageNumber: number }) => void): void;
};

/**
 * Resolves when `pageNumber` has been drawn (pdf.js `pagerendered`), or after `timeoutMs`
 * so a slow page never blocks showing the new document.
 */
export function whenRendered(bus: Bus, pageNumber: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      bus.off("pagerendered", onRendered);
      resolve();
    };
    const onRendered = (event: { pageNumber: number }) => {
      if (event.pageNumber === pageNumber) done();
    };
    const timer = setTimeout(done, timeoutMs);
    bus.on("pagerendered", onRendered);
  });
}
