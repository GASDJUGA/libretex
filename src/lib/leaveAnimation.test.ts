import { afterEach, describe, expect, it, vi } from "vitest";
import { animateLeave } from "./leaveAnimation";

/** jsdom has no Web Animations: an animation that ends when `end` is called. */
function fakeAnimations() {
  let end = () => {};
  const finished = new Promise<void>((resolve) => (end = resolve));
  const spy = vi
    .spyOn(
      HTMLElement.prototype as HTMLElement & { getAnimations: () => unknown[] },
      "getAnimations",
    )
    .mockImplementation(() => [{ finished }]);
  return { end: () => end(), spy };
}

function dialog() {
  const node = document.createElement("div");
  node.className = "lt-dialog-backdrop";
  node.innerHTML =
    '<div role="dialog" aria-labelledby="t"><h2 id="t">Pegar imagen</h2><input type="text" value="captura"></div>';
  document.body.append(node);
  return node;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// jsdom has no `getAnimations`; defined so that it can be spied (this file only).
Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  writable: true,
  value: () => [],
});

describe("animación de salida", () => {
  it("deja una copia inerte que se anima y desaparece al terminar", async () => {
    const animations = fakeAnimations();
    const node = dialog();
    node.querySelector("input")!.value = "diagrama espín";
    animateLeave(node);
    node.remove();
    await Promise.resolve();

    const ghost = document.body.querySelector<HTMLElement>(".lt-leaving")!;
    expect(ghost).not.toBeNull();
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.inert).toBe(true);
    // What was typed, not the initial value; no second dialog nor repeated ids for assistive tech.
    expect(ghost.querySelector("input")!.value).toBe("diagrama espín");
    expect(ghost.querySelector("[role], [id]")).toBeNull();

    animations.end();
    await vi.waitFor(() => expect(document.body.querySelector(".lt-leaving")).toBeNull());
  });

  it("si el elemento sigue en la página (React lo vuelve a montar) no hace nada", async () => {
    fakeAnimations();
    const node = dialog();
    animateLeave(node);
    await Promise.resolve();
    expect(document.body.querySelector(".lt-leaving")).toBeNull();
  });
});
