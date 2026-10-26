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
 * Resolves when `drawing()` says nothing visible is left to draw (checked now and after each
 * page pdf.js draws), or after `timeoutMs`.
 */
export function whenAllRendered(
  bus: Bus,
  drawing: () => boolean,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      bus.off("pagerendered", onRendered);
      resolve();
    };
    const onRendered = () => {
      if (!drawing()) done();
    };
    const timer = setTimeout(done, timeoutMs);
    bus.on("pagerendered", onRendered);
    onRendered();
  });
}

/** A page's box in PDF user space: `[x0, y0, x1, y1]`, origin at the bottom-left. */
export type PageBox = readonly number[];

/** SyncTeX point (from the page's top-left corner, y down) → PDF user space (y up). */
export function syncTexToPdf(x: number, y: number, box: PageBox): [number, number] {
  return [box[0] + x, box[3] - y];
}

/** PDF user space → SyncTeX point (from the page's top-left corner, y down). */
export function pdfToSyncTex(x: number, y: number, box: PageBox): [number, number] {
  return [x - box[0], box[3] - y];
}

/** CSS rectangle (inside the page element) of a SyncTeX box, given pdf.js's point converter. */
export function cssRect(
  rect: { left: number; top: number; width: number; height: number },
  box: PageBox,
  toViewport: (x: number, y: number) => number[],
) {
  const [ax, ay] = toViewport(...syncTexToPdf(rect.left, rect.top, box));
  const [bx, by] = toViewport(...syncTexToPdf(rect.left + rect.width, rect.top + rect.height, box));
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}
