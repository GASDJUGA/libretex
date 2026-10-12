/** Zoom of the PDF viewer: a fixed scale (1 = 100 %) or a fit mode computed by pdf.js. */
export type ZoomValue = number | "page-width" | "page-fit";

/** Steps of the zoom-in / zoom-out buttons. */
export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
] as const;

export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Fixed scales offered in the zoom menu. */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const EPSILON = 0.005;

/** Next step above the current scale (whatever produced it: a step, a fit mode, Ctrl+wheel). */
export function zoomIn(scale: number): number {
  return ZOOM_STEPS.find((step) => step > scale + EPSILON) ?? MAX_ZOOM;
}

/** Next step below the current scale. */
export function zoomOut(scale: number): number {
  return ZOOM_STEPS.findLast((step) => step < scale - EPSILON) ?? MIN_ZOOM;
}

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** «125 %» (non-breaking space, as in Spanish typography). */
export function formatZoom(scale: number): string {
  return `${Math.round(scale * 100)}\u00a0%`;
}

/** The value pdf.js expects in `currentScaleValue`. */
export function toScaleValue(zoom: ZoomValue): string {
  return typeof zoom === "number" ? String(clampZoom(zoom)) : zoom;
}

/**
 * Scale for a fit mode, as pdf.js computes it: `page` is a page view at its current
 * `scale` (CSS size `width`×`height`); 40 px are kept for the scrollbar and 5 px at the
 * bottom.
 */
export function fitScale(
  mode: "page-width" | "page-fit",
  container: { width: number; height: number },
  page: { width: number; height: number; scale: number },
): number {
  const widthScale = ((container.width - 40) / page.width) * page.scale;
  const heightScale = ((container.height - 5) / page.height) * page.scale;
  return clampZoom(mode === "page-width" ? widthScale : Math.min(widthScale, heightScale));
}

/**
 * Zoom factor for one Ctrl+wheel event: a mouse notch (≈100 px) is a 10 % step; touchpads
 * send many small deltas and zoom smoothly. `deltaMode` 1 = lines, 2 = pages.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 800 : deltaY;
  const factor = Math.pow(1.1, -pixels / 100);
  return Math.min(1.5, Math.max(1 / 1.5, factor));
}

/**
 * Immediate visual zoom: the drawn pages are scaled by the compositor (no relayout, no
 * scrolling) until the new zoom is ready in a hidden layer. Applied with transform-origin at
 * the top-left corner: `screen = t + k · content`.
 */
export type ZoomTransform = { k: number; tx: number; ty: number };

export const IDENTITY: ZoomTransform = { k: 1, tx: 0, ty: 0 };

/** The (untransformed) content point shown at `point`. */
export function underPoint(t: ZoomTransform, point: { x: number; y: number }) {
  return { x: (point.x - t.tx) / t.k, y: (point.y - t.ty) / t.k };
}

export function cssTransform(t: ZoomTransform): string {
  return `translate(${t.tx}px, ${t.ty}px) scale(${t.k})`;
}

/** One axis of the PDF view, in the scroll container's content coordinates. */
export type ZoomAxis = {
  /** Where the pages start and how long they are, at the drawn scale. */
  start: number;
  length: number;
  /** Size of the view, its scroll position and where the pages element starts. */
  view: number;
  scroll: number;
  offset: number;
  /** Pages narrower than the view are centered (pdf.js does it horizontally). */
  center: boolean;
  /** Length that doesn't scale before the content (margins and borders of earlier pages). */
  fixedBefore?: number;
};

/**
 * Translation along one axis for the visual zoom (`scale(k)` with origin at the pages
 * element's corner), so it shows where everything ends up once the zoom is drawn: the
 * content at `content` stays under `at` (a view coordinate) unless scrolling can't get there
 * (document edges), and narrow pages are centered.
 */
export function axisTranslate(axis: ZoomAxis, k: number, content: number, at: number): number {
  const { start, length, view, scroll, offset, center, fixedBefore = 0 } = axis;
  // Margins and borders before the content don't scale.
  const fixed = (1 - k) * fixedBefore;
  const scaled = k * length;
  let base: number;
  let shift: number;
  if (center && scaled <= view) {
    base = (view - scaled) / 2;
    shift = 0;
  } else {
    // Wider than the view, pdf.js's auto margins are 0; fixed margins stay.
    base = center ? 0 : start;
    const max = Math.max(0, 2 * base + scaled - view);
    shift = Math.min(Math.max(base + k * (content - start) + fixed - at, 0), max);
  }
  // On screen: base + k·(X − start) + fixed − shift; with the transform:
  // t + k·(X − offset) + offset − scroll.
  return base - k * start + fixed - shift + k * offset - offset + scroll;
}
