import { test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Screenshots for a human or an agent to LOOK at. This asserts nothing on
// purpose -- it is the input to the half of chart review that is judgement:
// whether a layout is confusing, whether a section reads like the real page,
// whether the widths make sense together. `charts.spec.ts` owns the half that
// is arithmetic.
//
// The staged card matters. Fifteen of the twenty specimens only render when a
// card is on the stage, so a capture without one photographs a quarter of the
// gallery and looks complete. That is how the first version of the checks
// suite ran green over five specimens.

const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

const VIEWPORTS = [
  { name: "375-phone", width: 375, height: 900 },
  { name: "768-tablet", width: 768, height: 1000 },
  { name: "1280-desktop", width: 1280, height: 1000 },
];

// Panels carry no id, so they are found by their heading text.
const SECTIONS = [
  // The production defect this work item exists to photograph. It can only be
  // captured before Panel stops being a .card, so it is listed before anything
  // else changes -- a panel absent from this list gets no cropped shot at all.
  "A player's reason, inside a panel",
  "Glossary figures",
  "Deck bands at every width",
  "Score breakdown at every width",
  "How you draft",
  "Score plot",
  // The deck-speed drill's reveal. Added last because the entries above are
  // ordered by the defect each was added to photograph, and this one is not a
  // defect -- it is a chart whose band and span have to be read together.
  "Speed ruler",
  // The set drills' progress panel. Listed because being absent from here is
  // how the chart that used to sit in it shipped a y-axis reading "0.0%" at
  // every tick and counts stamped through the band names: it had bays on /dev
  // and no cropped shot anybody looked at. The chart is gone -- it worked for
  // one drill and drew one dot for the other -- and the panel stays listed,
  // because a specimen nobody photographs is a specimen nobody checks.
  "Reading a set",
];

const OUT = "../../.checks/screens";

for (const viewport of VIEWPORTS) {
  test(`capture /dev at ${viewport.width}px`, async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(STAGED, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('svg[role="img"]', { timeout: 60_000 });
    // The stage resolves the card asynchronously; the specimens that need it
    // mount after it lands.
    await page.waitForTimeout(2_500);

    await page.screenshot({ path: `${OUT}/dev-${viewport.name}-full.png`, fullPage: true });

    for (const heading of SECTIONS) {
      const panel = page
        .locator("section", { has: page.getByRole("heading", { name: heading, exact: true }) })
        .first();
      if ((await panel.count()) === 0) continue;
      const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await panel.screenshot({ path: `${OUT}/${slug}-${viewport.name}.png` });
    }
  });
}
