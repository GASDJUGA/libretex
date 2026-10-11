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
 * The point pdf.js keeps still while zooming (`updateScale({ origin })`). pdf.js subtracts
 * its `containerTopLeft` (the container's offsetTop/offsetLeft, not its screen position),
 * so the point is expressed relative to the container and shifted by that offset.
 */
export function zoomOrigin(
  point: { x: number; y: number },
  container: { left: number; top: number },
  containerTopLeft: readonly number[],
): [number, number] {
  return [
    point.x - container.left + containerTopLeft[1],
    point.y - container.top + containerTopLeft[0],
  ];
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
