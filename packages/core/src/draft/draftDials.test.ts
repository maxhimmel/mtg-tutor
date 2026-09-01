import { describe, expect, it } from "vitest";
import type { ColorCode, EngineCard } from "../model/card.js";
import { DIAL_BASELINES, DIAL_FINGERPRINT } from "./dials.js";
import { addCurvature } from "./dialFit.js";
import { DRAFTER_TAU } from "./dialFit.js";
import { SHOWN_DIALS, curvatureOf, dialsForDraft, drafterReadout } from "./draftDials.js";

// What a stored draft is allowed to be worth later. Two of these are about
// refusing rather than computing, and those are the ones that matter: a
// curvature in units nothing records still sums, still fits, and still produces
// a confident readout about a quantity nobody can name.

const card = (
  name: string,
  colors: ColorCode[],
  value: number,
  extra: Partial<EngineCard> = {},
): EngineCard => ({ name, colors, value, ...extra }) as EngineCard;

const pack = (rated: boolean, suffix = ""): EngineCard[] => [
  card(`Bomb${suffix}`, ["U"], 0.62, {
    slot: "mythic",
    role: "evasion",
    turn: 5,
    ...(rated ? { tableValue: 0.71 } : {}),
  }),
  card(`Removal${suffix}`, ["R"], 0.575, {
    slot: "common",
    role: "removal",
    turn: 2,
    ...(rated ? { tableValue: 0.6 } : {}),
  }),
  card(`Body${suffix}`, ["U"], 0.55, { slot: "uncommon", role: "creature", turn: 3 }),
  card(`Filler${suffix}`, ["G"], 0.48, { slot: "common", role: "creature", turn: 4 }),
];

const draft = (rated: boolean) =>
  [0, 1, 2].map((i) => {
    const cards = pack(rated, `-${i}`);
    return { pack: cards, picked: cards[i % cards.length] };
  });

describe("dialsForDraft", () => {
  it("comes back as twenty-eight numbers and a fingerprint", () => {
    const stored = dialsForDraft(draft(true));
    expect(stored).toBeDefined();
    expect(stored?.gradient).toHaveLength(6);
    expect(stored?.hessian).toHaveLength(21);
    expect(stored?.fingerprint).toBe(DIAL_FINGERPRINT);
    expect(stored?.picks).toBe(3);
  });

  it("refuses a pool with no pick order at all", () => {
    // Per-card fallback to `value` is correct and stays. A whole pool without it
    // is a draft measured on a different column from every other draft in a
    // player's history, with `table` and `power` becoming the same bundle twice.
    expect(dialsForDraft(draft(false))).toBeUndefined();
  });

  it("refuses a draft with no decision in it", () => {
    const one = pack(true);
    expect(dialsForDraft([{ pack: [one[0]], picked: one[0] }])).toBeUndefined();
  });
});

describe("curvatureOf", () => {
  const measured = Object.keys(DIAL_BASELINES)[0];

  it("gives back a curvature for a set somebody has measured", () => {
    const stored = dialsForDraft(draft(true));
    const curvature = curvatureOf(stored!, measured);
    expect(curvature?.gradient).toHaveLength(6);
    expect(curvature?.picks).toBe(3);
  });

  it("corrects for the set, so the same draft reads differently in two of them", () => {
    const stored = dialsForDraft(draft(true));
    const a = curvatureOf(stored!, "ktk");
    const b = curvatureOf(stored!, "woe");
    expect(a!.gradient).not.toEqual(b!.gradient);
    // And the Hessian does not move, which is what makes the correction one
    // subtraction rather than a refit.
    expect(a!.hessian).toEqual(b!.hessian);
  });

  it("refuses a set nobody has measured, rather than treating it as average", () => {
    expect(curvatureOf(dialsForDraft(draft(true))!, "zzz")).toBeUndefined();
  });

  it("refuses numbers written against different bundles", () => {
    const stored = { ...dialsForDraft(draft(true))!, fingerprint: "stale" };
    expect(curvatureOf(stored, measured)).toBeUndefined();
  });
});

describe("drafterReadout", () => {
  const draftsOf = (n: number) => {
    const stored = dialsForDraft(draft(true))!;
    let pooled = curvatureOf(stored, Object.keys(DIAL_BASELINES)[0])!;
    for (let i = 1; i < n; i++) {
      pooled = addCurvature(pooled, curvatureOf(stored, Object.keys(DIAL_BASELINES)[0])!);
    }
    return pooled;
  };

  it("shows two dials, and they are the two that survived the measuring", () => {
    expect(SHOWN_DIALS).toEqual(["lane", "signal"]);
    expect(drafterReadout(draftsOf(3), DRAFTER_TAU).dials.map((d) => d.id)).toEqual([
      "lane",
      "signal",
    ]);
  });

  it("says nothing about a drafter with almost no picks", () => {
    // Three picks is not a draft and certainly not a history. Everything has to
    // come back uncalled, or the first person to finish one pack is told
    // something about themselves.
    const readout = drafterReadout(draftsOf(1), DRAFTER_TAU);
    for (const dial of readout.dials) expect(dial.called).toBe(false);
  });

  it("gives sharpness as a direction, never as a figure", () => {
    // The stored one-step estimate of it is biased -- 0.24 against a truth of
    // 0.50 -- so the type must not carry a number somebody could print.
    const { sharpness } = drafterReadout(draftsOf(3), DRAFTER_TAU);
    expect(Object.keys(sharpness).sort()).toEqual(["above", "called"]);
  });

  it("counts the picks that went into it", () => {
    expect(drafterReadout(draftsOf(4), DRAFTER_TAU).picks).toBe(12);
  });
});
