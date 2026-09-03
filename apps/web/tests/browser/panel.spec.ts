import { test, expect } from "@playwright/test";

// Panel must not be a daisyUI `.card`, and this is what says so out loud.
//
// `.card` ships descendant rules for a card's COVER IMAGE and they reach any
// <figure> at any depth inside: `display:flex; align-items:center;
// justify-content:center`, plus overflow and radius rewrites on figure's
// :first-child and :last-child. Reasoning renders a <figure> and sits in a
// Panel on three shipped screens, so its quote and attribution were centred and
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

test("no figure in a Panel is restyled by daisyUI's card rules", async ({ page }) => {
  // The subject is pinned deliberately. The glossary Figure is NOT its
  // card-body's only child -- card-body holds the specimen's wrapper div, which
  // holds Bay divs, and Bay renders a label span BEFORE its children. So the
  // figure's parent is the Bay div and it is :last-child only, never
  // :first-child. That matters: `.card figure:last-child` is what sets
  // overflow:hidden, so a subject that is neither would pass this identically
  // before and after the fix and pin nothing.
  const state = await page.evaluate(() => {
    const figures = Array.from(document.querySelectorAll<HTMLElement>("section figure"));
    return figures.map((figure) => {
      const style = getComputedStyle(figure);
      return {
        isLastChild: figure === figure.parentElement?.lastElementChild,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      };
    });
  });

  expect(state.length, "no figures found — the check would pass vacuously").toBeGreaterThan(0);
  expect(state.some((f) => f.isLastChild), "no :last-child figure — the overflow half is unexercised").toBe(true);

  // No border-radius assertion here on purpose. `.rounded-box` on Figure is
  // emitted unlayered while `.card figure:last-child` sits in a daisyUI
  // sublayer, so the corners computed 12px before this fix as well as after --
  // asserting them would pin nothing. Only these four actually change.
  for (const figure of state) {
    expect(figure.alignItems).toBe("normal");
    expect(figure.justifyContent).toBe("normal");
    expect(figure.overflowX).toBe("visible");
    expect(figure.overflowY).toBe("visible");
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
