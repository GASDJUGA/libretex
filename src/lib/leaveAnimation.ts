/**
 * Exit animation for something React unmounts at once (dialogs: pedido del usuario, para que
 * la salida sea como la entrada). Whoever closes a dialog just stops rendering it (Escape,
 * Cancelar, or its opener after saving), so a visual copy stays in its place, inert and
 * hidden from assistive technology, plays the `lt-leaving` animation and is removed.
 */

/** Copies what was typed or chosen: `cloneNode` keeps only the initial values. */
function copyFormState(from: HTMLElement, to: HTMLElement) {
  const source = from.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  const target = to.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  source.forEach((field, i) => {
    const copy = target[i];
    if (!copy) return;
    copy.value = field.value;
    if (field instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      copy.checked = field.checked;
    }
  });
}

/**
 * Call while `node` is still on the page, right before React removes it (a layout effect's
 * cleanup). Nothing happens if it stays (React's development double mount), or where the
 * page can't animate.
 */
export function animateLeave(node: HTMLElement | null) {
  if (!node || typeof node.getAnimations !== "function") return;
  const ghost = node.cloneNode(true) as HTMLElement;
  copyFormState(node, ghost);
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.style.pointerEvents = "none";
  for (const element of [ghost, ...ghost.querySelectorAll<HTMLElement>("[id], [role]")]) {
    element.removeAttribute("id");
    element.removeAttribute("role");
  }
  ghost.classList.add("lt-leaving");
  queueMicrotask(() => {
    if (node.isConnected) return;
    document.body.append(ghost);
    const remove = () => ghost.remove();
    void Promise.all(ghost.getAnimations({ subtree: true }).map((a) => a.finished))
      .catch(() => {})
      .then(remove);
    // In case an animation never ends (a hidden window doesn't run them).
    setTimeout(remove, 600);
  });
}
