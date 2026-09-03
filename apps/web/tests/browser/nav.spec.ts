import { test, expect } from "@playwright/test";

// The masthead's interactions, which overflow.spec.ts cannot see.
//
// That file measures the drawer CLOSED -- it asks whether a page scrolls
// sideways, and the answer is the same whether the panel opens or not. Every
// behaviour this component actually has is therefore invisible to it: a trigger
// that opens nothing, a panel that cannot be escaped, a section that went
// missing from the list, a masthead that quietly grew a hamburger on a desktop.
// All of those pass `scrollsSideways === false` comfortably.
//
// So this is the guard for the half that moves. It is a browser suite rather
// than a vitest one for the reason the rest of this directory exists: none of
// it is knowable without layout, and `hidden sm:flex` is a media query that no
// jsdom render resolves.

const ROUTE = "/principles";

test.describe("phone, below the nav breakpoint", () => {
  test.use({ viewport: { width: 375, height: 900 } });

  test("the trigger opens the panel, and says so", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    const trigger = page.getByRole("button", { name: "Sections" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // The inline row is not merely off-screen below the `nav` breakpoint -- it is display:none,
    // so it is out of the tab order too. A hidden-but-focusable copy of the
    // whole nav is the failure this asserts against.
    await expect(page.locator("header nav[aria-label='Sections']").first()).toBeHidden();

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#nav-drawer-panel")).toBeVisible();
  });

  test("focus is not stolen on load, and is placed and returned on open and close", async ({
    page,
  }) => {
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    // Nothing is focused by arriving. The panel's focus effect runs on mount
    // with `open` false, and a guard that cannot tell "mounted" from "closed"
    // puts focus on the hamburger of every page load on exactly the viewports
    // this component is for.
    expect(await page.evaluate(() => document.activeElement?.tagName ?? null)).toBe("BODY");

    const trigger = page.getByRole("button", { name: "Sections" });
    await trigger.click();
    await expect(page.locator("#nav-drawer-panel")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Back to the trigger, not to the top of the document -- closing a menu
    // should not cost you your place.
    await expect(trigger).toBeFocused();
  });

  test("every section is in the panel and reachable", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    await page.getByRole("button", { name: "Sections" }).click();

    const panel = page.locator("#nav-drawer-panel");
    const labels = ["Draft", "Review", "Stats", "Practice", "Challenges", "Principles", "Glossary"];
    for (const label of labels) {
      await expect(panel.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    // The count matters as much as the presence: one NAV array feeds both
    // presentations, and a section added to the inline row and not here would
    // pass every per-label check above.
    await expect(panel.getByRole("link")).toHaveCount(labels.length);
  });

  test("the overlay and a route change both close it", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    const trigger = page.getByRole("button", { name: "Sections" });

    await trigger.click();
    await page.locator(".drawer-overlay").click({ position: { x: 10, y: 400 } });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // Following a row must not leave the panel over the page it took you to.
    await trigger.click();
    await page.locator("#nav-drawer-panel").getByRole("link", { name: /^Glossary/ }).click();
    await expect(page).toHaveURL(/glossary/);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#nav-drawer-panel")).toBeHidden();
  });

  // A ROUTE CHANGE THAT IS NOT A ROW CLICK, which is the only thing that
  // actually exercises the close-on-pathname effect.
  //
  // Every row already closes the panel from its own onClick, so the test above
  // passes with that effect deleted -- checked by deleting it. Going back with
  // the panel open is the case the effect is really for: without it you land on
  // the previous page with a menu still over it and no memory of opening one.
  test("going back closes it, without a row having been clicked", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    const trigger = page.getByRole("button", { name: "Sections" });

    await trigger.click();
    await page.locator("#nav-drawer-panel").getByRole("link", { name: /^Glossary/ }).click();
    await expect(page).toHaveURL(/glossary/);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await page.goBack();
    await expect(page).toHaveURL(/principles/);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#nav-drawer-panel")).toBeHidden();
  });
});

// OPEN, AT THE WIDTH THE STANDARD IS WRITTEN AT.
//
// overflow.spec.ts only ever sees the panel closed, where daisyUI parks it off
// the trailing edge and clips it -- so it says nothing about the state a person
// is actually in while using this. 320px is where SC 1.4.10 Reflow is written,
// and a panel that itself overflows there would have moved the defect rather
// than fixed it.
test("the open panel fits the narrowest screen the standard names", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Sections" }).click();
  // The panel slides in, so measuring on the click measures it mid-flight. Focus
  // lands only once daisyUI's visibility transition has finished, which makes it
  // the settle signal rather than a sleep.
  await expect(page.locator("#nav-drawer-panel")).toBeFocused();

  const m = await page.evaluate(() => {
    const panel = document.querySelector("#nav-drawer-panel")!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    return {
      vw,
      panelWidth: Math.round(panel.width),
      leftEdge: Math.round(panel.left),
      rightOverhang: Math.round(panel.right - vw),
      scrollsSideways: document.documentElement.scrollWidth > vw + 1,
    };
  });

  // `w-72` is 288px, which alone would exceed a 320px screen once the overlay
  // is allowed any width at all; `max-w-[85vw]` is what brings it to 272 and
  // leaves the page visible behind it. Asserting the cap rather than the
  // nominal width is the point -- dropping max-w would still look fine at 375.
  expect(m.panelWidth).toBeLessThanOrEqual(Math.round(m.vw * 0.85));
  expect(m.leftEdge).toBeGreaterThanOrEqual(0);
  expect(m.rightOverhang).toBeLessThanOrEqual(1);
  expect(m.scrollsSideways).toBe(false);
});

// WHERE THE SWAP HAPPENS, which is the number most likely to be quietly wrong.
//
// The masthead needs 674px for one row, measured across the whole header with
// the signed-out 64px "Sign in" button that sets the binding case -- so the
// breakpoint is 43rem (688px), not the stock `sm` (640) an earlier pass used.
// `sm` put the inline row on screen through 640-673, where it does not fit.
//
// These run SIGNED OUT deliberately. Signed in the header needs only 642, so a
// signed-in run would pass at a breakpoint 32px too low and would not catch a
// regression to `sm`.
test("the row appears only where the whole masthead fits", async ({ page }) => {
  for (const width of [640, 687]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    await expect(
      page.getByRole("button", { name: "Sections" }),
      `hamburger should still be showing at ${width}px`,
    ).toBeVisible();
  }

  for (const width of [688, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    await expect(
      page.locator("header nav[aria-label='Sections']").first(),
      `inline row should be showing at ${width}px`,
    ).toBeVisible();

    // And it must actually FIT there -- the point of 674 is that the row and the
    // rest of the masthead share one line.
    // NOT a count of distinct `top` values. `items-center` gives children of
    // different heights different tops on the SAME line, so that count reads 2
    // on a masthead that has not wrapped at all -- which is exactly how this
    // assertion first failed against correct code. One row means every child
    // shares some vertical span.
    const oneRow = await page.evaluate(() => {
      const kids = Array.from(document.querySelector("header")!.children).map((c) =>
        c.getBoundingClientRect(),
      );
      return Math.max(...kids.map((k) => k.top)) < Math.min(...kids.map((k) => k.bottom));
    });
    expect(oneRow, `masthead should be one row at ${width}px`).toBe(true);
  }
});

// Above the breakpoint this change is supposed to have done nothing at all,
// which is the claim most likely to rot: the drawer and the row are in one
// component now, so a later edit to the phone half can reach the desktop one
// without anybody meaning it.
for (const width of [768, 1280]) {
  test(`the masthead is untouched at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    await expect(page.locator("header nav[aria-label='Sections']").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sections" })).toBeHidden();

    const m = await page.evaluate(() => {
      const header = document.querySelector("header")!;
      const nav = header.querySelector("nav")!;
      const active = header.querySelector('nav [aria-current="page"]') as HTMLElement;
      return {
        rows: Array.from(
          new Set(Array.from(nav.children).map((c) => Math.round(c.getBoundingClientRect().top))),
        ).length,
        markerGapFromRule: Math.round(
          header.getBoundingClientRect().bottom - active.getBoundingClientRect().bottom,
        ),
      };
    });

    // One row, and the active marker still sitting on the header's own bottom
    // rule -- 4px measured before this change and after it. The marker being a
    // segment of that rule is the whole of what AppHeader's comment argues for,
    // and it is the thing a careless `flex-wrap` here would quietly break.
    expect(m.rows).toBe(1);
    expect(m.markerGapFromRule).toBeLessThanOrEqual(6);
  });
}
