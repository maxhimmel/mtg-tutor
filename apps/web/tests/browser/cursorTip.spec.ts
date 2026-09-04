import { test, expect } from "@playwright/test";

// Does the cursor actually get an answer.
//
// WHY THIS NEEDS A BROWSER AND WHY IT EXISTS AT ALL. The speed ruler shipped
// with a tip that was wired, typechecked, and completely dead: the transparent
// hit target was drawn FIRST, so the band, the span and the dot each sat on top
// of it, and SVG delivers a pointer event to the topmost painted element. The
// three things a reader actually aims at were the three things that did nothing.
// Nothing in TypeScript, vitest or a diff can see that -- it is a fact about
// hit-testing in a rendered document, so it takes a rendered document.
//
// The subject is /dev for the reason charts.spec.ts gives: the gallery is
// already every component with real numbers, so this does not have to build a
// fixture.

const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

/** The tip renders into a portal on body, not inside the chart. */
const TIP = "[data-cursor-tip]";

test.describe("the speed ruler answers at the cursor", () => {
  test("the marks themselves answer, not just the empty scale", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(STAGED);

    const section = page
      .locator("section", { has: page.getByText("Speed ruler", { exact: true }) })
      .first();
    await expect(section).toBeVisible();
    const svg = section.locator("svg").first();
    await expect(svg).toBeVisible();

    // HOVER THE ELEMENTS, NOT A GUESSED COORDINATE. The first version of this
    // test moved the mouse to the SVG's vertical centre -- which, with a 20px
    // top and 40px bottom margin, lands BELOW the marks on empty plot where the
    // hit target is topmost whichever order it is in. It passed against the bug
    // it was written for. Playwright centres on the element, so asking for the
    // circle really does put the pointer on the circle.
    const marks = [
      { name: "the dot", locator: svg.locator("circle").first() },
      // The band: the only rect with a rounded corner and the hollow fill.
      { name: "the band", locator: svg.locator("rect[rx]").first() },
    ];

    const show = async (x: number, y: number, what: string) => {
      await page.mouse.move(x, y);
      // The tip damps by elapsed time rather than by frame, so one move can
      // land inside the frame the listener attached on. A second settles it.
      await page.mouse.move(x + 1, y);
      await expect(
        page.locator(TIP),
        `hovering ${what} said nothing — the hit target is probably painted under the marks`,
      ).toBeVisible({ timeout: 2000 });
      const said = (await page.locator(TIP).first().textContent())?.trim() ?? "";
      expect(said.length, `hovering ${what} produced an empty tip`).toBeGreaterThan(0);
      await page.mouse.move(0, 0);
    };

    for (const mark of marks) {
      await expect(mark.locator, `${mark.name} did not render`).toBeVisible();
      const box = await mark.locator.boundingBox();
      if (!box) throw new Error(`${mark.name} has no box to hover`);
      await show(box.x + box.width / 2, box.y + box.height / 2, mark.name);
    }

    // The span is a `<line>`, whose geometric box has zero height even though it
    // is painted with a 6px stroke -- Playwright calls that hidden, so it cannot
    // be hovered as an element. It shares the dot's centre line, so the point is
    // derived from the dot: same y, far enough left to be off the dot itself.
    const dot = await svg.locator("circle").first().boundingBox();
    if (!dot) throw new Error("the dot has no box to derive the span from");
    await show(dot.x - 14, dot.y + dot.height / 2, "the span");
  });

  test("the tip names turns, which is the unit the chart is in", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(STAGED);

    const svg = page
      .locator("section", { has: page.getByText("Speed ruler", { exact: true }) })
      .first()
      .locator("svg")
      .first();
    const dot = svg.locator("circle").first();
    await dot.hover({ force: true });
    const box = await dot.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
    await expect(page.locator(TIP)).toBeVisible({ timeout: 2000 });
    await expect(page.locator(TIP).first()).toContainText("turns");
  });
});
