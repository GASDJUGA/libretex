import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { canAnimate } from "../../lib/transition";

const OPEN = { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
// Folded stays at zero until React removes it (else one frame at full height).
const CLOSE = { duration: 170, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" as const };

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Children of a tree node (a folder, a chapter of the outline) that unfold and fold with an
 * animation (pedido del usuario: ver el pliegue): the height grows from or shrinks to zero
 * while the content fades. Folding keeps the content on the page, inert, until the animation
 * ends. Without animations (jsdom, «reducir animaciones») it appears and goes at once.
 * `children` is a function: a closed node doesn't build what it would show.
 */
export function Collapsible({ open, children }: { open: boolean; children: () => ReactNode }) {
  const [rendered, setRendered] = useState(open);
  const animates = canAnimate() && !reducedMotion();
  if (open && !rendered) setRendered(true);
  // Without animations, folded content goes at once.
  if (!open && rendered && !animates) setRendered(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastOpen = useRef(open);
  const running = useRef<{ animation: Animation; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  useLayoutEffect(() => {
    // Only when it changes: shown as it is at first (also when React runs this twice).
    if (lastOpen.current === open) return;
    lastOpen.current = open;
    const el = ref.current;
    if (!el) return;
    const full = el.scrollHeight;
    // From where it is now: halfway through the other way, if it was still moving.
    const from = running.current ? el.getBoundingClientRect().height : open ? 0 : el.offsetHeight;
    if (running.current) {
      clearTimeout(running.current.timer);
      running.current.animation.cancel();
      running.current = null;
    }
    if (!animates) {
      el.style.overflow = "";
      return;
    }
    const to = open ? full : 0;
    const opacity = (height: number) => (full > 0 ? Math.min(1, height / full) : open ? 0 : 1);
    const timing = open ? OPEN : CLOSE;
    el.style.overflow = "hidden";
    const animation = el.animate(
      [
        { height: `${from}px`, opacity: opacity(from) },
        { height: `${to}px`, opacity: open ? 1 : 0 },
      ],
      timing,
    );
    // In case frames don't come (a hidden window): it still ends.
    const timer = setTimeout(() => animation.finish(), timing.duration + 300);
    running.current = { animation, timer };
    animation.finished
      .then(() => {
        if (running.current?.animation !== animation) return;
        clearTimeout(timer);
        running.current = null;
        el.style.overflow = "";
        if (!open) setRendered(false);
      })
      .catch(() => {});
  }, [open, animates]);

  useEffect(
    () => () => {
      if (!running.current) return;
      clearTimeout(running.current.timer);
      running.current.animation.cancel();
      running.current = null;
    },
    [],
  );

  if (!rendered) return null;
  return (
    <div ref={ref} inert={!open}>
      {children()}
    </div>
  );
}
