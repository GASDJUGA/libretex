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
