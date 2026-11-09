/**
 * `AbortSignal.any` that always follows its signals. In WebKit (WebKitGTK 2.54, macOS's
 * WKWebView) the combined signal loses its link to the others once the garbage collector runs:
 * aborting them later no longer aborts it, and the listeners registered with it are never
 * removed. pdf.js registers its annotation editor's `keydown`/`keyup` on the window that way,
 * so every PDF viewer replaced (each compilation, each zoom) stayed alive with its pages,
 * reachable from those listeners: after a while, gigabytes of memory and typing that lags
 * behind the keys. Here the combined signal is kept by a listener on each of the others.
 */
export function anySignal(signals: Iterable<AbortSignal>): AbortSignal {
  const controller = new AbortController();
  const list = [...signals];
  const aborted = list.find((s) => s.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return controller.signal;
  }
  for (const source of list) {
    source.addEventListener("abort", () => controller.abort(source.reason), {
      once: true,
      // Once aborted, it stops listening to the others (a long-lived signal combined many
      // times keeps no listener per combination).
      signal: controller.signal,
    });
  }
  return controller.signal;
}

/** WebKit, not Chromium (whose user agent also says AppleWebKit) nor Firefox. */
export const isWebKit = (userAgent = globalThis.navigator?.userAgent ?? "") =>
  /AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg\//.test(userAgent);

/** Replaces `AbortSignal.any` in WebKit, before pdf.js is loaded. */
export function installAbortSignalAny(
  target: typeof AbortSignal = AbortSignal,
  webkit = isWebKit(),
) {
  if (!webkit) return;
  Object.defineProperty(target, "any", { configurable: true, writable: true, value: anySignal });
}
