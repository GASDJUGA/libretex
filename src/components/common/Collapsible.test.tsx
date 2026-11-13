import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Collapsible } from "./Collapsible";

type Fake = {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
  cancelled: boolean;
};

/** Web Animations as the browser has them (jsdom has none): each one ends when told. */
function installAnimations() {
  const started: Fake[] = [];
  Object.assign(Element.prototype, {
    getAnimations: () => [],
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const finished = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      finished.catch(() => {});
      const fake: Fake = { keyframes, options, finish: () => resolve(), cancelled: false };
      started.push(fake);
      return {
        finished,
        finish: () => resolve(),
        cancel: () => {
          fake.cancelled = true;
          reject(new DOMException("cancelled", "AbortError"));
        },
      };
    },
  });
  return started;
}

function removeAnimations() {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  delete proto.getAnimations;
  delete proto.animate;
}

const tree = (open: boolean) => (
  <Collapsible open={open}>
    {() => (
      <ul>
        <li>Subsección</li>
      </ul>
    )}
  </Collapsible>
);

describe("Collapsible", () => {
  afterEach(removeAnimations);

  it("sin animaciones (jsdom), el contenido aparece y se va al instante", () => {
    const { rerender } = render(tree(true));
    expect(screen.getByText("Subsección")).toBeInTheDocument();
    rerender(tree(false));
    expect(screen.queryByText("Subsección")).toBeNull();
    rerender(tree(true));
    expect(screen.getByText("Subsección")).toBeInTheDocument();
  });

  describe("con animaciones", () => {
    let started: Fake[];
    beforeEach(() => {
      started = installAnimations();
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
    });
    afterEach(() => vi.restoreAllMocks());

    it("al plegar, el contenido se encoge y recién al terminar se quita", async () => {
      const { rerender } = render(tree(true));
      expect(started).toHaveLength(0); // shown at first without animating
      rerender(tree(false));
      const item = screen.getByText("Subsección");
      expect(item.closest("[inert]")).not.toBeNull(); // no focus while it goes
      expect(started).toHaveLength(1);
      expect(started[0].keyframes[0]).toMatchObject({ height: "120px" });
      expect(started[0].keyframes.at(-1)).toMatchObject({ height: "0px" });
      // Folded stays folded until it is removed: no frame at full height in between.
      expect(started[0].options.fill).toBe("forwards");
      await act(async () => started[0].finish());
      expect(screen.queryByText("Subsección")).toBeNull();
    });

    it("al desplegar, el contenido crece desde cero", () => {
      const { rerender } = render(tree(false));
      expect(screen.queryByText("Subsección")).toBeNull();
      rerender(tree(true));
      expect(screen.getByText("Subsección").closest("[inert]")).toBeNull();
      expect(started).toHaveLength(1);
      expect(started[0].keyframes[0]).toMatchObject({ height: "0px" });
      expect(started[0].keyframes.at(-1)).toMatchObject({ height: "120px" });
    });

    it("desplegar a mitad del pliegue lo conserva", async () => {
      const { rerender } = render(tree(true));
      rerender(tree(false));
      rerender(tree(true));
      expect(started[0].cancelled).toBe(true);
      await act(async () => {
        started[0].finish();
        started[1].finish();
      });
      expect(screen.getByText("Subsección").closest("[inert]")).toBeNull();
    });

    it("con «reducir animaciones» del sistema, sin animación", () => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query) => ({ matches: query.includes("reduce") }) as MediaQueryList,
      );
      const { rerender } = render(tree(true));
      rerender(tree(false));
      expect(screen.queryByText("Subsección")).toBeNull();
      expect(started).toHaveLength(0);
    });
  });
});
