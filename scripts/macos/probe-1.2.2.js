// Checks in WKWebView what 1.2.2 brought from Linux: `AbortSignal.any` replaced in WebKit
// (pdf.js viewers no longer kept alive), folders and outline sections that fold with an
// animation (height per frame), and menus opened with the mouse without their first item
// marked. Run with the build served as tauri://localhost/ (see wkprobe.swift).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const leaf = (text) =>
    [...document.querySelectorAll("*")].find(
      (e) => e.textContent?.trim() === text && e.children.length === 0,
    );
  const result = {};

  // Heights of a collapsible box, frame by frame, while `act` runs.
  const heights = async (box, act) => {
    const seen = [];
    let on = true;
    (async () => {
      while (on) {
        seen.push(Math.round(box.isConnected ? box.getBoundingClientRect().height : -1));
        await frame();
      }
    })();
    act();
    await sleep(450);
    on = false;
    await frame();
    // Distinct values in order, so a smooth animation shows several steps.
    return seen.filter((h, i) => i === 0 || h !== seen[i - 1]);
  };

  leaf("Tesis de magíster").click();
  await sleep(1500);

  // 2. A folder of the file tree.
  const folder = [...document.querySelectorAll("[role=treeitem][aria-expanded]")][0];
  if (folder) {
    const row = folder.querySelector("div, button") ?? folder;
    const isOpen = () => folder.getAttribute("aria-expanded") === "true";
    if (!isOpen()) {
      row.click();
      await sleep(400);
    }
    const box = folder.querySelector("[role=group]")?.parentElement;
    result.folder = {
      name: folder.textContent.trim().slice(0, 20),
      fold: await heights(box, () => row.click()),
    };
    const box2 = () => folder.querySelector("[role=group]")?.parentElement;
    const unfold = [];
    row.click();
    for (let i = 0; i < 20; i++) {
      await frame();
      const b = box2();
      if (b) unfold.push(Math.round(b.getBoundingClientRect().height));
    }
    result.folder.unfold = unfold.filter((h, i) => i === 0 || h !== unfold[i - 1]);
  } else {
    result.folder = "no folder in the tree";
  }

  // 3. A section of the outline with subsections.
  const heading = document.querySelector("button[aria-expanded=true]:not([role])");
  if (heading) {
    const arrow = heading.querySelector("[aria-hidden]");
    const box = heading.parentElement.querySelector(":scope > div");
    result.outline = {
      name: heading.textContent.trim().slice(0, 30),
      fold: await heights(box, () =>
        arrow.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      ),
      expandedAfter: heading.getAttribute("aria-expanded"),
    };
    arrow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(400);
    result.outline.expandedAgain = heading.getAttribute("aria-expanded");
  } else {
    result.outline = "no expandable heading";
  }

  // 4. A menu opened with the mouse: the first item has the focus but is not marked.
  const menuButton = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Archivo",
  );
  menuButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  menuButton.click();
  await sleep(300);
  const items = [...document.querySelectorAll("[role=menuitem]")];
  const bg = (e) => getComputedStyle(e).backgroundColor;
  result.menu = {
    items: items.length,
    firstFocused: document.activeElement === items[0],
    firstFocusVisible: items[0]?.matches(":focus-visible"),
    firstBackground: items[0] && bg(items[0]),
    secondBackground: items[1] && bg(items[1]),
  };
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  // 1. AbortSignal.any: replaced when pdf.js loads (compile with ⌘↩ so the PDF appears) by
  // our version, which follows its signals after a garbage collection.
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", metaKey: true, bubbles: true }),
  );
  for (let i = 0; i < 40 && !document.querySelector(".lt-pdf-viewer canvas"); i++) await sleep(250);
  result.pdfDrawn = !!document.querySelector(".lt-pdf-viewer canvas");
  result.abortSignalAnyNative = /\[native code\]/.test(String(AbortSignal.any));
  const a = new AbortController();
  const both = AbortSignal.any([a.signal, new AbortController().signal]);
  a.abort();
  result.abortSignalAnyFollows = both.aborted;

  return JSON.stringify(result, null, 1);
})();
