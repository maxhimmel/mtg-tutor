import { test, expect, type Page } from "@playwright/test";

// Which elements are wider than the viewport, and by how much.
//
// The page-level check was skipped when this suite was written, on the
// reasoning that /dev deliberately holds fixed-width bays and would
// false-positive. That reasoning was wrong in a specific way: the bays are
// mostly `max-w-full`, so they do not overflow, and something else does. The
// evidence was a 375px fullPage screenshot that looked like text clipped
// mid-word -- which is what a viewport-width screenshot of wider-than-viewport
// content looks like, and not clipping at all.
//
// This reports rather than asserts. The first job is to learn whether the
// offenders are the dev gallery's own scaffolding or something every page has,
// because that decides whose bug it is.

const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

// /dev is the reported subject; the other two are ordinary pages carrying the
// same shell and nav, which is the comparison that matters.
const ROUTES = [STAGED, "/principles", "/glossary"];

async function report(page: Page, route: string) {
  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const doc = document.documentElement;
    const offenders: {
      tag: string;
      cls: string;
      width: number;
      over: number;
      text: string;
    }[] = [];

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const over = Math.round(box.right - viewport);
      if (over <= 1) continue;
      // Only the outermost offender in a chain is interesting; a child that
      // overflows because its parent does is noise.
      const parent = el.parentElement;
      if (parent && parent.getBoundingClientRect().right - viewport > 1) continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className ?? "").toString().slice(0, 100),
        width: Math.round(box.width),
        over,
        text: (el.textContent ?? "").trim().slice(0, 45),
      });
    }

    return {
      viewport,
      documentScrollWidth: doc.scrollWidth,
      scrollsSideways: doc.scrollWidth > viewport + 1,
      offenders: offenders.sort((a, b) => b.over - a.over).slice(0, 12),
    };
  });

  console.log(`OVERFLOW ${route} ` + JSON.stringify(result, null, 2));
  return result;
}

for (const route of ROUTES) {
  test(`what overflows 375px on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // No waitForSelector here: /principles and /glossary may carry no chart,
    // and the point is to compare the shell, which renders immediately.
    await page.waitForTimeout(3_000);
    const result = await report(page, route);
    expect(result.viewport).toBe(375);
  });
}
