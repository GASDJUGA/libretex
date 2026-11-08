import { useEffect, useState } from "react";
import { useBuffers, type Buffer } from "./buffers";

/** Pause in typing after which the outline and the preamble catch up with the text. */
export const SETTLE_MS = 250;

type Buffers = Record<string, Buffer>;

const sameFiles = (a: Buffers, b: Buffers) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => k in b);
};

/**
 * The open buffers, for what is derived from the whole text (the outline, the preamble's
 * macros and packages). A file loaded or closed shows at once; edits arrive once typing
 * pauses for `SETTLE_MS`. Following every keystroke re-parsed the document and re-rendered
 * those panels before the typed letter could be drawn (the editor felt slow).
 */
export function useSettledBuffers(): Buffers {
  const [buffers, setBuffers] = useState(() => useBuffers.getState().buffers);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const latest = () => setBuffers(useBuffers.getState().buffers);
    // It may have changed between the render and this effect.
    latest();
    const unsubscribe = useBuffers.subscribe((now, before) => {
      if (now.buffers === before.buffers) return;
      clearTimeout(timer);
      if (sameFiles(now.buffers, before.buffers)) timer = setTimeout(latest, SETTLE_MS);
      else latest();
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);
  return buffers;
}
