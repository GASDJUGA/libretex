// Opens a sample project, compiles with ⌘↩ (Ctrl+↩ must not) and checks that the PDF is drawn.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { platform: navigator.platform };
  const card = [...document.querySelectorAll("*")].find(
    (e) => e.textContent?.trim() === "Tesis de magíster" && e.children.length === 0,
  );
  card?.click();
  await sleep(1500);
  // Ctrl+Enter must not compile on macOS; Cmd+Enter must.
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true, bubbles: true }),
  );
  await sleep(1500);
  out.pagesAfterCtrl = document.querySelectorAll(".page").length;
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", metaKey: true, bubbles: true }),
  );
  await sleep(4000);
  out.pages = document.querySelectorAll(".page").length;
  const cv = document.querySelector(".page canvas");
  if (cv) {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128 && d[i + 3] > 0) dark++;
    out.inked = dark;
  }
  return JSON.stringify(out);
})();
