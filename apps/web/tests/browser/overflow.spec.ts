import { test, expect, type Page } from "@playwright/test";

// What overflows, measured two different ways, because the first version of
// this file measured only one of them and its silence was then used as proof
// of the other.
//
// VIEWPORT OVERFLOW -- does anything cross the right edge of the window. This
// is what makes a page scroll sideways on a phone. The nav does it, on every
// route, and that is work item nav-overflow-375.
//
// CONTAINER OVERFLOW -- does any element spill out of its own parent's box.
// This is invisible to the viewport measure whenever it happens left of the
// window edge, which is exactly where a figure inside a 327px panel lives. The
// cycle-1 evidence for "the figures are broken at 375px" was an ELEMENT
// screenshot (panel.screenshot, clipped to a 327px box) showing content cut off
// at that box -- a container overflow, which the viewport measure cannot see
// and did not report. Two artifacts then argued past each other over a
// question neither instrument had asked.
//
// Reports rather than asserts, still. A threshold chosen before knowing which
// of these two the figures actually exhibit would encode the same confusion.

const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

// /dev is the subject; the other two carry the same shell and are the control
// that tells a shared-shell defect from a gallery one.
const ROUTES = [STAGED, "/principles", "/glossary"];

async function report(page: Page, route: string) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;

    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}.${(el.className ?? "").toString().replace(/\s+/g, ".").slice(0, 70)}`;

    // 1. Crosses the window's right edge.
    const pastViewport: { el: string; over: number; text: string }[] = [];
    // 2. Spills out of its own parent's box, wherever that box happens to be.
    const pastParent: { el: string; parent: string; over: number; text: string }[] = [];

    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const text = (el.textContent ?? "").trim().slice(0, 40);

      const overViewport = Math.round(box.right - viewport);
      if (overViewport > 1) {
        const parent = el.parentElement;
        // Keep the outermost of a chain; a child inherits its parent's crossing.
        if (!parent || parent.getBoundingClientRect().right - viewport <= 1) {
          pastViewport.push({ el: describe(el), over: overViewport, text });
        }
      }

      const parent = el.parentElement;
      if (!parent || parent === document.body) continue;
      const style = getComputedStyle(parent);
      // `display: contents` generates NO BOX, so its rect is degenerate and
      // every child appears to overflow it. BandList wraps each grade row in
      // one, which is why a first run reported 39 offenders on /dev and 1 on an
      // ordinary page -- almost all of them this artifact. Walk up to the
      // nearest ancestor that actually has a box.
      let boxParent: HTMLElement | null = parent;
      while (boxParent && getComputedStyle(boxParent).display === "contents") {
        boxParent = boxParent.parentElement;
      }
      if (!boxParent || boxParent === document.body) continue;
      const pstyle = getComputedStyle(boxParent);
      // A scroll container is allowed to hold something wider than itself.
      if (pstyle.overflowX === "auto" || pstyle.overflowX === "scroll") continue;
      if (pstyle.overflowX === "hidden" || pstyle.overflowX === "clip") continue;
      const pbox = boxParent.getBoundingClientRect();
      const overParent = Math.round(box.right - pbox.right);
      if (overParent > 1) {
        pastParent.push({ el: describe(el), parent: describe(boxParent), over: overParent, text });
      }
    }

    return {
      viewport,
      documentScrollWidth: document.documentElement.scrollWidth,
      scrollsSideways: document.documentElement.scrollWidth > viewport + 1,
      pastViewportCount: pastViewport.length,
      pastViewport: pastViewport.sort((a, b) => b.over - a.over).slice(0, 8),
      pastParentCount: pastParent.length,
      pastParent: pastParent.sort((a, b) => b.over - a.over).slice(0, 12),
    };
  });

  console.log(`OVERFLOW ${route} ` + JSON.stringify(result, null, 2));
  return result;
}

for (const route of ROUTES) {
  test(`what overflows at 375px on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    const result = await report(page, route);
    expect(result.viewport).toBeGreaterThan(0);
  });
}
