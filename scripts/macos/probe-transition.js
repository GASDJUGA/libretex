// Switches between home and two projects and checks, frame by frame, that the page never gets
// wider or taller than the window and cannot be scrolled: a view moved to one side by its
// transition used to widen the page by 18 px, and a trackpad scroll then moved the tabs.
// Run with SIZE (a full screen, e.g. 1470x956) and the build served as tauri://localhost/.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const page = document.scrollingElement;
  const watch = async (act) => {
    let width = 0;
    let height = 0;
    let scrolled = 0;
    let on = true;
    (async () => {
      while (on) {
        width = Math.max(width, page.scrollWidth);
        height = Math.max(height, page.scrollHeight);
        page.scrollLeft = 40;
        page.scrollTop = 40;
        scrolled = Math.max(scrolled, page.scrollLeft, page.scrollTop);
        page.scrollLeft = 0;
        page.scrollTop = 0;
        await frame();
      }
    })();
    act();
    await sleep(1200);
    on = false;
    await frame();
    return { width, height, scrolled };
  };
  const click = (text) =>
    [...document.querySelectorAll("*")]
      .find((e) => e.textContent?.trim() === text && e.children.length === 0)
      .click();
  const tab = (text) =>
    [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.includes(text));
  const result = { window: [innerWidth, innerHeight] };
  result.homeToProject = await watch(() => click("Tesis de magíster"));
  result.projectToHome = await watch(() => tab("Inicio").click());
  result.homeToOther = await watch(() => click("Apuntes de Mecánica Clásica"));
  result.projectToProject = await watch(() => tab("Tesis").click());
  return JSON.stringify(result);
})();
