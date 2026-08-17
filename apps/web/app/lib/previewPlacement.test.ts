import { describe, expect, it } from "vitest";
import { PREVIEW_H, PREVIEW_W, UPRIGHT, TURNED, place, type Viewport } from "./previewPlacement";

const GAP = 12;
const SCREEN: Viewport = { width: 1400, height: 900, wall: null };

// A card tile as the board draws one, sitting well inside the screen.
const tile = (left: number, top: number, w = 150, h = 200) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
  height: h,
});

describe("where the preview goes", () => {
  it("hangs to the right of the card, centred on it", () => {
    const anchor = tile(100, 300);
    const at = place(anchor, SCREEN, false, [UPRIGHT])!;
    expect(at.lefts).toEqual([anchor.right + GAP]);
    expect(at.top).toBe(anchor.top + anchor.height / 2 - PREVIEW_H / 2);
    expect(at.height).toBe(PREVIEW_H);
  });

  it("flips to the left of a card that is near the right edge", () => {
    const anchor = tile(1200, 300);
    const at = place(anchor, SCREEN, false, [UPRIGHT])!;
    expect(at.lefts).toEqual([anchor.left - GAP - PREVIEW_W]);
  });

  it("stays on screen either way", () => {
    // Nowhere on either side: the card is as wide as the room it has.
    const at = place(tile(40, 300, 1320), SCREEN, false, [UPRIGHT])!;
    expect(at.lefts[0]).toBeGreaterThanOrEqual(GAP);
    expect(at.lefts[0] + PREVIEW_W).toBeLessThanOrEqual(SCREEN.width - GAP);
  });

  it("keeps a tall block inside the viewport top and bottom", () => {
    const at = place(tile(100, 20), SCREEN, false, [UPRIGHT])!;
    expect(at.top).toBe(GAP);
  });
});

// The page's own wall: the draft board's side panel is where the coach is
// talking, and the preview stops at it rather than covering it.
describe("the marked edge", () => {
  it("treats it as the right-hand wall", () => {
    const anchor = tile(300, 300);
    const walled: Viewport = { ...SCREEN, wall: 700 };
    const at = place(anchor, walled, false, [UPRIGHT])!;
    expect(at.lefts[0] + PREVIEW_W).toBeLessThanOrEqual(700 - GAP);
  });

  it("ignores one that is not to the right of the card", () => {
    // A layout that stacks the panel below the board leaves its left edge behind
    // the card, and clamping to it would leave the preview nowhere to go.
    const anchor = tile(900, 300);
    const stacked: Viewport = { ...SCREEN, wall: 100 };
    expect(place(anchor, stacked, false, [UPRIGHT])).toEqual(
      place(anchor, SCREEN, false, [UPRIGHT]),
    );
  });
});

describe("faces that do not all fit", () => {
  it("draws a back beside the front when there is room", () => {
    const at = place(tile(100, 300), SCREEN, false, [UPRIGHT, UPRIGHT])!;
    expect(at.lefts).toHaveLength(2);
    expect(at.lefts[1] - at.lefts[0]).toBe(PREVIEW_W + GAP);
  });

  it("drops from the tail and never the front", () => {
    const narrow: Viewport = { ...SCREEN, wall: 660 };
    const at = place(tile(100, 300), narrow, false, [UPRIGHT, UPRIGHT, UPRIGHT])!;
    expect(at.lefts).toHaveLength(1);
  });

  it("measures a sideways front as the landscape box it is drawn in", () => {
    const at = place(tile(100, 300), SCREEN, false, [TURNED, UPRIGHT])!;
    expect(at.lefts[1] - at.lefts[0]).toBe(PREVIEW_H + GAP);
    // The block is as tall as its tallest face, which here is the upright back.
    expect(at.height).toBe(PREVIEW_H);
  });
});

describe("the keyword panel", () => {
  it("sits beyond the preview, so the card never moves for it", () => {
    const at = place(tile(100, 300), SCREEN, true, [UPRIGHT])!;
    expect(at.panelLeft).toBe(at.lefts[0] + PREVIEW_W + GAP);
  });

  it("falls back to the near side when there is no room beyond", () => {
    const at = place(tile(205, 300, 80), { width: 900, height: 900, wall: null }, true, [
      UPRIGHT,
    ])!;
    expect(at.panelLeft).toBeLessThan(at.lefts[0]);
  });

  it("is dropped rather than moving the card image", () => {
    const at = place(tile(20, 300, 80), { width: 700, height: 900, wall: null }, true, [
      UPRIGHT,
    ])!;
    expect(at.panelLeft).toBeNull();
    expect(at.lefts).toHaveLength(1);
  });
});

/**
 * The rule that replaced dismissing on every scroll. A preview says "the pointer
 * is on THIS card"; the page moving under it does not make that false, so the
 * preview follows the card -- and the one thing that DOES make it false is the
 * card leaving the screen the pointer is on.
 */
describe("a card that has scrolled", () => {
  it("takes the preview with it while any of it is visible", () => {
    const before = place(tile(100, 400), SCREEN, false, [UPRIGHT])!;
    const after = place(tile(100, 300), SCREEN, false, [UPRIGHT])!;
    expect(after.top).toBe(before.top - 100);
  });

  it("still counts when only its bottom edge is on screen", () => {
    expect(place(tile(100, -199), SCREEN, false, [UPRIGHT])).not.toBeNull();
  });

  it("closes once it is off the top", () => {
    expect(place(tile(100, -200), SCREEN, false, [UPRIGHT])).toBeNull();
  });

  it("closes once it is off the bottom", () => {
    expect(place(tile(100, 900), SCREEN, false, [UPRIGHT])).toBeNull();
  });

  it("closes on a card scrolled out sideways", () => {
    expect(place(tile(-150, 300), SCREEN, false, [UPRIGHT])).toBeNull();
    expect(place(tile(1400, 300), SCREEN, false, [UPRIGHT])).toBeNull();
  });
});

it("has nothing to place for a card with no faces", () => {
  expect(place(tile(100, 300), SCREEN, false, [])).toBeNull();
});

it("draws a card at its printed width", () => {
  expect(PREVIEW_W).toBe(320);
  expect(UPRIGHT).toEqual({ w: PREVIEW_W, h: PREVIEW_H });
  expect(TURNED).toEqual({ w: PREVIEW_H, h: PREVIEW_W });
});
