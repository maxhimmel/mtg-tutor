import { test, expect } from "@playwright/test";

// Panel must not be a daisyUI `.card`, and this is what says so out loud.
//
// `.card` ships descendant rules for a card's COVER IMAGE and they reach any
// <figure> at any depth inside: `display:flex; align-items:center;
// justify-content:center`, plus overflow and radius rewrites on figure's
// :first-child and :last-child. Reasoning renders a <figure> and sits in a
// Panel on three shipped screens, so its quote and attribution were centered and
// shrink-wrapped instead of filling the width under their own pl-3 rail --
// measured at 5% of the figure's width for the attribution at 1280.
//
// Two halves, and both are needed. The first asserts the rules are gone. The
// second asserts nothing else moved, because the fix replaced four of `.card`'s
// declarations with plain utilities and DROPPED three others.

const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(STAGED, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('svg[role="img"]', { timeout: 60_000 });
});

test("no Panel is a daisyUI card", async ({ page }) => {
  // The direct assertion, and the one that cannot fail for an unrelated reason.
  // An earlier version of this test looped EVERY `section figure` on /dev and
  // demanded align-items:normal -- but Commitment already ships a figure with
  // `items-center`, and the charting standard requires wide content to scroll
  // inside its own overflow-x:auto container. Either pattern landing on this
  // page would have failed here and reported "the card rules came back", which
  // is a test naming the wrong cause.
  const panels = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main section")).map((section) => ({
      classes: Array.from(section.classList),
      heading: section.querySelector("h2")?.textContent?.slice(0, 40) ?? "",
    })),
  );

  expect(panels.length, "no Panel sections found — the check would pass vacuously").toBeGreaterThan(0);
  for (const panel of panels) {
    expect(panel.classes, `"${panel.heading}" is still a daisyUI card`).not.toContain("card");
  }
});

test("the Reasoning figure fills its width instead of centering", async ({ page }) => {
  // The specific subject, measured rather than inspected. Reasoning renders a
  // <figure> and appears in a Panel on three shipped screens; when Panel was a
  // `.card`, daisyUI's `align-items:center` won uncontested and both children
  // shrink-wrapped -- the attribution to 5% of the figure's width at this
  // viewport, the quote to 13% on a short reason.
  //
  // Both children, deliberately. The attribution never wraps, so it detached
  // from its rail at every width and every reason length; measuring the quote
  // alone with a long sample reads ~100% and would have called this fixed while
  // half of it was still broken.
  const measured = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll("section")).find((section) =>
      section.querySelector("h2")?.textContent?.includes("A player's reason"),
    );
    if (!panel) return null;
    return Array.from(panel.querySelectorAll("figure")).map((figure) => {
      const width = figure.getBoundingClientRect().width;
      const quote = figure.querySelector("blockquote")!.getBoundingClientRect().width;
      const caption = figure.querySelector("figcaption")!.getBoundingClientRect().width;
      return { quotePct: (quote / width) * 100, captionPct: (caption / width) * 100 };
    });
  });

  expect(measured, "the Reasoning specimen is missing from /dev").not.toBeNull();
  expect(measured!.length, "no Reasoning figures in the specimen").toBeGreaterThan(0);
  for (const figure of measured!) {
    expect(figure.quotePct).toBeGreaterThan(99);
    expect(figure.captionPct).toBeGreaterThan(99);
  }
});

test("Panel still looks like a panel without the card class", async ({ page }) => {
  const panel = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>("main section");
    if (!section) return null;
    const style = getComputedStyle(section);
    const radiusBox = getComputedStyle(document.documentElement).getPropertyValue("--radius-box").trim();
    // Resolve the theme token rather than asserting a literal: --radius-box is
    // set in globals.css and is a theme decision, not a property of this fix. A
    // literal would fail a theme change for an unrelated reason.
    const probe = document.createElement("div");
    probe.style.borderRadius = radiusBox;
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    return {
      display: style.display,
      flexDirection: style.flexDirection,
      position: style.position,
      radius: style.borderTopLeftRadius,
      expected,
    };
  });

  expect(panel, "no Panel section found").not.toBeNull();
  expect(panel!.display).toBe("flex");
  expect(panel!.flexDirection).toBe("column");
  expect(panel!.position).toBe("relative");
  expect(panel!.radius).toBe(panel!.expected);

  // Deliberately NOT asserted: outline, outline-offset and transition:outline.
  // `.card` set all three and the replacement drops them. They are inert here
  // -- the outline is transparent, the section takes no tabIndex and Panel
  // spreads no props, and every direct child is a div, so :focus-visible,
  // [aria-checked] and :has(>:checked) can never fire. Named here so this test
  // is not mistaken for proof that they survived.
});
