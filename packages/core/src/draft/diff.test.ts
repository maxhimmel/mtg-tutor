import { describe, expect, it } from "vitest";
import { fakeSet } from "../testing/fakeSet.js";
import { mulberry32 } from "../util/rng.js";
import { cardValue } from "../scoring/value.js";
import { botRng, dealDraft } from "./deal.js";
import { DraftEngine } from "./engine.js";
import {
  diffDrafts,
  forkImpact,
  leanColors,
  samePack,
  summarizeDiff,
  type DiffSide,
} from "./diff.js";
import type { ColorCode, EngineCard, PoolCard } from "../model/card.js";
import type { PodPolicy } from "./bots.js";

/**
 * A seed whose pod actually comes apart when the human diverges.
 *
 * Not every one does, and that is a finding rather than a nuisance: swept over
 * 1000 seed/divergence combinations on this fixture, 339 of them NEVER drift --
 * the two drafts take different cards at the fork and still see all 45 packs
 * identical, because eight greedy bots consuming the same top cards in a
 * different order leaves the same cards behind. 657 drift and then re-converge
 * later. Both are why `samePack` is per row and computed rather than assumed.
 */
const SEED = 2;
const DIVERGE = 0;

/**
 * Drive a pod and record what the human actually saw, as the store would.
 *
 * `divergeAt` takes the SECOND-best card at that index and the best everywhere
 * else, which is how two people end up in the same seat of two pods that agree
 * about almost everything -- the case the whole feature has to survive.
 */
function draft(divergeAt?: number, pod: PodPolicy = "legacy"): DiffSide[] {
  const engine = new DraftEngine(dealDraft(fakeSet(), SEED), botRng(SEED), pod);
  const sides: DiffSide[] = [];

  for (let i = 0; !engine.isComplete(); i++) {
    const pack = engine.currentPack;
    if (pack.length === 0) break;

    const ranked = [...pack].sort((a, b) => cardValue(b) - cardValue(a));
    const chosen: EngineCard = i === divergeAt && ranked[1] ? ranked[1] : ranked[0];

    const rec = engine.humanPick(chosen);
    sides.push({
      pickIndex: i,
      packNo: rec.packNo,
      pickNo: rec.pickNo,
      pack: rec.pack.map((c) => ({ name: c.name, colors: c.colors })),
      pickedName: rec.picked.name,
      score: rec.score.score,
      grade: rec.score.grade,
    });
  }

  return sides;
}

describe("samePack", () => {
  it("ignores order, because a pack is a set of cards", () => {
    const a = [{ name: "x", colors: [] }, { name: "y", colors: [] }];
    const b = [{ name: "y", colors: [] }, { name: "x", colors: [] }];
    expect(samePack(a, b)).toBe(true);
  });

  it("is false when one card differs", () => {
    const a = [{ name: "x", colors: [] }, { name: "y", colors: [] }];
    const b = [{ name: "x", colors: [] }, { name: "z", colors: [] }];
    expect(samePack(a, b)).toBe(false);
  });
});

describe("two drafters on one seed", () => {
  it("see identical packs for as long as neither has diverged", () => {
    const rows = diffDrafts(draft(), draft());
    expect(rows.every((r) => r.samePack)).toBe(true);
    expect(rows.every((r) => r.agree)).toBe(true);
  });

  it("see the same packs up to the wheel, then stop -- measured, not assumed", () => {
    const rows = diffDrafts(draft(), draft(DIVERGE));
    const t = summarizeDiff(rows);

    // The claim notes.md records: a divergence cannot reach your own packs
    // until the pod passes yours back round. Swept over 1000 seed/divergence
    // combinations the minimum observed delay is exactly 8 -- DRAFT.seats --
    // and never once less, so the floor is asserted as a property while the
    // exact index is left to the seed.
    expect((t.firstDrift ?? 0) - DIVERGE).toBeGreaterThanOrEqual(8);
    expect(t.guaranteedThrough).toBe((t.firstDrift ?? 0) - 1);
  });

  it("still mostly AGREE across the drift, which is why a drifted diff lies", () => {
    // The dangerous property, and the reason samePack is per row: the two
    // drafts keep taking the same cards long after they stopped being asked the
    // same question, so a diff that has quietly stopped comparing anything
    // looks exactly like one that has not.
    const rows = diffDrafts(draft(), draft(DIVERGE));
    const t = summarizeDiff(rows);

    expect(t.agreed / t.rows).toBeGreaterThan(0.6);
    expect(t.comparable).toBeLessThan(t.rows);

    // The lie itself, stated exactly rather than as a ratio: rows where the two
    // of them took the same card while looking at DIFFERENT packs. Every one is
    // an agreement that means nothing, and there is no way to tell from the
    // picks alone -- which is the entire reason `samePack` is carried per row
    // instead of being inferred from whether the picks match.
    const hollowAgreements = rows.filter((r) => r.agree && !r.samePack);
    expect(hollowAgreements.length).toBeGreaterThan(0);
  });

  it("does not assume drift is monotonic", () => {
    // Packs re-converge by coincidence, so `comparable` counts every matching
    // row while `guaranteedThrough` stops at the first gap. If these were ever
    // equal by construction the per-row truth would be dead code.
    const rows = diffDrafts(draft(), draft(DIVERGE));
    const t = summarizeDiff(rows);
    const matchingRows = rows.filter((r) => r.samePack).length;

    expect(t.comparable).toBe(matchingRows);
    expect(t.comparable).toBeGreaterThanOrEqual(t.guaranteedThrough + 1);
  });
});

describe("forks and off-shelf", () => {
  it("counts a same-pack disagreement as a fork", () => {
    const rows = diffDrafts(draft(), draft(DIVERGE));
    const t = summarizeDiff(rows);

    expect(t.forks[0]?.pickIndex).toBe(DIVERGE);
    expect(t.forks[0]?.yours).not.toBe(t.forks[0]?.theirs);
  });

  it("never calls a different-pack disagreement a fork", () => {
    const rows = diffDrafts(draft(), draft(DIVERGE));
    const t = summarizeDiff(rows);

    // The distinction the screen depends on: there is no choice to compare
    // against on a pack you never saw, so those rows must not be drawn as
    // decisions somebody got wrong.
    expect(t.forks.every((f) => rows[f.pickIndex].samePack)).toBe(true);
    expect(rows.filter((r) => r.offShelf).every((r) => !r.samePack)).toBe(true);
  });

  it("names what each side leaned on without reading a stored pool", () => {
    const rows = diffDrafts(draft(), draft(DIVERGE));
    const last = rows[rows.length - 1];

    // The old assertion here was `length > 0` on the COMMITTED colours, and it
    // is what let a real bug ship: a forty-two-card pool commits to four or five
    // colours, which passes that check and painted every strand of the braid
    // multicolour from about pick four to the end of the draft, on both sides.
    expect(last.yourLean.length).toBeGreaterThan(0);
    expect(last.yourLean.length).toBeLessThanOrEqual(2);
    expect(last.theirLean.length).toBeLessThanOrEqual(2);
  });
});

describe("leanColors", () => {
  const pool = (...colors: string[]): PoolCard[] =>
    colors.map((c, i) => ({ name: `card-${i}`, colors: [c as ColorCode] }));

  it("is empty until something has two cards behind it", () => {
    expect(leanColors([])).toBe("");
    expect(leanColors(pool("U", "B", "R"))).toBe("");
  });

  it("ignores a colour with only one card in the pool", () => {
    expect(leanColors(pool("U", "U", "R"))).toBe("U");
  });

  it("never names more than two, however wide the pool gets", () => {
    // The whole point. A pool this broad is ordinary by pick forty-two.
    const wide = pool("W", "W", "U", "U", "U", "B", "B", "B", "B", "R", "R", "G", "G");
    expect(leanColors(wide)).toBe("UB");
  });

  it("orders the answer WUBRG rather than by count", () => {
    // So the pair reads the way a Magic player writes it, and so the same two
    // colours never render two different ways as the counts move around.
    expect(leanColors(pool("G", "G", "G", "U", "U"))).toBe("UG");
  });
});

describe("forkImpact", () => {
  const set = fakeSet();
  const mine = draft();
  const names = mine.map((s) => s.pickedName);

  it("reports nothing changed when the swap is the same card", () => {
    const impact = forkImpact(dealDraft(set, SEED), SEED, names, DIVERGE, names[DIVERGE], "legacy");
    expect(impact.reach).toBe(0);
    expect(impact.delay).toBeUndefined();
  });

  it("measures a real swap reaching downstream packs", () => {
    const theirs = draft(DIVERGE)[DIVERGE].pickedName;
    expect(theirs).not.toBe(names[0]);

    const impact = forkImpact(dealDraft(set, SEED), SEED, names, DIVERGE, theirs, "legacy");
    expect(impact.reach).toBeGreaterThan(0);
    expect(impact.of).toBeGreaterThan(impact.reach - 1);
  });

  it("cannot report a delay shorter than the wheel", () => {
    // Your own pick reaches your own packs only when the pod passes it back
    // round. A delay of 1 would mean the pack in front of you changed because
    // of what you just took out of it, which is not how passing works.
    const theirs = draft(DIVERGE)[DIVERGE].pickedName;
    const impact = forkImpact(dealDraft(set, SEED), SEED, names, DIVERGE, theirs, "legacy");
    expect(impact.delay).toBeGreaterThanOrEqual(8);
  });

  /**
   * The pod is an input, and for a fortnight it was a default.
   *
   * Every test above plays `legacy` and asks about `legacy`, so all three stayed
   * green through the whole life of the bug -- trap #4, a battery that cannot
   * notice the thing it exists to catch. `DEFAULT_POD` is `table2`, so the case
   * that was actually shipping is the one nothing here covered.
   *
   * Both of these fail without the pod parameter: the first because the deal
   * would be walked by the wrong bots and truncate on a name they had taken,
   * the second because that truncation used to return `of: 0` instead of saying
   * anything.
   */
  describe("the pod it is replayed under", () => {
    const podded = draft(undefined, "table2");
    const poddedNames = podded.map((s) => s.pickedName);

    it("measures a table2 draft when it is told the draft was table2", () => {
      const theirs = draft(DIVERGE, "table2")[DIVERGE].pickedName;
      const impact = forkImpact(dealDraft(set, SEED), SEED, poddedNames, DIVERGE, theirs, "table2");

      // The denominator is the point: every later pack was reachable, which is
      // what a walk that ran to the end of the draft looks like.
      expect(impact.of).toBe(poddedNames.length - DIVERGE - 1);
    });

    it("refuses to answer about a draft it cannot replay", () => {
      // Same draft, wrong pod. The old behaviour was a confident `reach: 0` --
      // "this pick changed nothing" -- from a walk that stopped after a handful
      // of picks. Loud is the only safe direction here, and challenges.ts
      // catches it into the reader-facing "weights unavailable".
      expect(() =>
        forkImpact(dealDraft(set, SEED), SEED, poddedNames, DIVERGE, poddedNames[DIVERGE], "legacy"),
      ).toThrow(/diverged from the draft/);
    });
  });
});
