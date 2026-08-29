import { describe, expect, it } from "vitest";
import { TIP_GAP, damp, placeTip, splitSymbols } from "./cursorTip";

// The two numbers a cursor-follower gets wrong, tested where they can be
// reached. Both of these shipped broken on the archetype quiz's reveal and both
// were reported by a person rather than caught here, which is why they are
// functions now: neither was testable inside an animation frame inside a
// component.

const VIEWPORT = { width: 1440, height: 900 };
const SIZE = { width: 272, height: 80 };

describe("placeTip", () => {
  it("sits down and to the right of the pointer with room to spare", () => {
    expect(placeTip({ x: 400, y: 300 }, SIZE, VIEWPORT)).toEqual({
      x: 400 + TIP_GAP.x,
      y: 300 + TIP_GAP.y,
    });
  });

  // Flipped rather than clamped: a box that slides along an edge keeps moving
  // after the pointer has stopped and ends up pointing at whatever is beside
  // it.
  it("flips to the left of the pointer rather than running off the right", () => {
    const at = placeTip({ x: 1400, y: 300 }, SIZE, VIEWPORT);

    expect(at.x).toBe(1400 - TIP_GAP.x - SIZE.width);
    expect(at.x + SIZE.width).toBeLessThan(VIEWPORT.width);
  });

  it("flips above the pointer rather than running off the bottom", () => {
    const at = placeTip({ x: 400, y: 870 }, SIZE, VIEWPORT);

    expect(at.y).toBe(870 - TIP_GAP.y - SIZE.height);
    expect(at.y + SIZE.height).toBeLessThan(VIEWPORT.height);
  });

  // The two axes decide separately, so the bottom-right corner is not a choice
  // between being clipped sideways and being clipped downwards.
  it("flips both ways at once in the far corner", () => {
    const at = placeTip({ x: 1400, y: 870 }, SIZE, VIEWPORT);

    expect(at.x + SIZE.width).toBeLessThan(VIEWPORT.width);
    expect(at.y + SIZE.height).toBeLessThan(VIEWPORT.height);
  });

  // A box with no room on either side has to land somewhere, and hard against
  // the left is the one place all of it can be read.
  it("keeps a box wider than the room on screen rather than pushing it off", () => {
    const wide = { width: 400, height: 80 };

    expect(placeTip({ x: 20, y: 300 }, wide, { width: 360, height: 900 }).x).toBeGreaterThan(0);
  });
});

describe("damp", () => {
  // The unit the number is quoted in: `ease` is what one 60Hz frame takes, so
  // somebody tuning it is tuning the thing they think they are.
  it("takes exactly `ease` in one frame at 60Hz", () => {
    expect(damp(0.28, 1000 / 60)).toBeCloseTo(0.28, 10);
  });

  // The bug this function exists for. A fixed fraction per frame chases twice
  // as fast on a 120Hz display, so two half-frames must come to one whole one.
  it("covers the same ground in two 120Hz frames as in one at 60Hz", () => {
    const half = damp(0.28, 1000 / 120);
    const remaining = (1 - half) * (1 - half);

    expect(1 - remaining).toBeCloseTo(damp(0.28, 1000 / 60), 10);
  });

  it("moves further the longer the frame took", () => {
    expect(damp(0.28, 32)).toBeGreaterThan(damp(0.28, 16));
  });

  // The clamp lives in the caller, so this has to stay sane when it is handed
  // a gap it should never see.
  it("never overshoots however long the gap", () => {
    expect(damp(0.28, 100_000)).toBeLessThanOrEqual(1);
    expect(damp(0.28, 0)).toBe(0);
  });

  it("is a no-op at zero and instant at one", () => {
    expect(damp(0, 16)).toBe(0);
    expect(damp(1, 16)).toBe(1);
  });
});

describe("splitSymbols", () => {
  it("keeps plain text in one piece", () => {
    expect(splitSymbols("2 cards")).toEqual([{ text: "2 cards" }]);
  });

  it("pulls a symbol out from between its words", () => {
    expect(splitSymbols("2 {U}, 1 {R} — Bolt")).toEqual([
      { text: "2 " },
      { mana: "U" },
      { text: ", 1 " },
      { mana: "R" },
      { text: " — Bolt" },
    ]);
  });

  // The case a bare letter could not say at all, and the reason the tip takes
  // the app's cost notation rather than a colour code.
  it("keeps both halves of a gold pair as separate pips", () => {
    expect(splitSymbols("{U}{B}")).toEqual([{ mana: "U" }, { mana: "B" }]);
  });

  it("says nothing about an empty sentence", () => {
    expect(splitSymbols("")).toEqual([]);
  });
});
