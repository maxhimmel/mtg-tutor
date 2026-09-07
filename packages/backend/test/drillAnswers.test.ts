// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";

// The drill answer store, and the fold read back through it.
//
// WHY THE FOLD IS TESTED HERE AND NOT ONLY IN CORE. `readProgress` has its own
// unit tests over rows a test invents, and that is exactly the shape trap #5's
// second half describes: `missProgress` was proved in core over hand-built rows
// including a case the store could not write, so a green assertion of
// `heldOn: 1` sat under a panel whose `heldOn` could not leave zero, and the
// layer with the defect had no tests at all.
//
// Everything this file asserts is store-side and invisible from core: the
// duplicate rule keying on `attemptId`, the normalising of a card's name into a
// row key, one person's rows staying theirs, and the two-armed repeat split
// arriving out of real writes rather than out of a literal.

const ISS = "https://example.workos.com";
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: `${ISS}|${subject}`, issuer: ISS, role: "tester" });

const SET = "tst";

const record = (
  t: ReturnType<typeof harness>,
  who: string,
  args: {
    drill?: "archetypes" | "deckSpeed";
    name: string;
    answered: string;
    correct: string;
    sigmas?: number;
    margin?: number;
    attemptId: string;
  },
) =>
  as(t, who).mutation(api.drills.answers.record, {
    drill: args.drill ?? "archetypes",
    setCode: SET,
    name: args.name,
    answered: args.answered,
    correct: args.correct,
    sigmas: args.sigmas ?? 2.5,
    margin: args.margin ?? 1.2,
    attemptId: args.attemptId,
  });

const rows = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => ctx.db.query("drillAnswers").collect());

describe("drills/answers.record", () => {
  it("writes what was asked and what was said, and never a verdict", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Cathar Commando",
      answered: "WU",
      correct: "WB",
      sigmas: 3.2,
      attemptId: "run-1:0",
    });

    const [row] = await rows(t);
    expect(row).toMatchObject({
      drill: "archetypes",
      setCode: SET,
      key: "cathar commando",
      answered: "WU",
      correct: "WB",
      sigmas: 3.2,
    });
    // Correctness is recomputed from the two strings, so a re-seed that moves a
    // set's statistics cannot re-decide an answer somebody already gave.
    expect("correct" in row && typeof row.correct === "string").toBe(true);
    expect(Object.keys(row)).not.toContain("read");
  });

  it("keys on the normalised name, so a card's halves cannot miss each other", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Cathar Commando",
      answered: "WB",
      correct: "WB",
      attemptId: "run-1:0",
    });
    expect((await rows(t))[0].key).toBe("cathar commando");
  });

  it("refuses a second write from the same attempt", async () => {
    const t = harness();
    const args = {
      name: "Cathar Commando",
      answered: "WB",
      correct: "WB",
      attemptId: "run-1:0",
    } as const;
    await record(t, "alice", args);
    await record(t, "alice", args);
    expect(await rows(t)).toHaveLength(1);
  });

  // THE TRAP `pickAnswers` FELL INTO AND WROTE DOWN. Refusing a row because it
  // says what the last one said is refusing somebody standing by their read --
  // and here it would break the drill outright, because a card is only ever put
  // back BECAUSE it was misread, so a second wrong answer is the commonest thing
  // that can happen and is `stillWrong` rather than a duplicate.
  it("takes the same answer again from a later attempt", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Cathar Commando",
      answered: "WU",
      correct: "WB",
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      name: "Cathar Commando",
      answered: "WU",
      correct: "WB",
      attemptId: "run-2:0",
    });
    expect(await rows(t)).toHaveLength(2);
  });

  it("refuses a caller who is not signed in", async () => {
    const t = harness();
    await expect(
      t.mutation(api.drills.answers.record, {
        drill: "archetypes",
        setCode: SET,
        name: "Cathar Commando",
        answered: "WB",
        correct: "WB",
        sigmas: 2,
        margin: 1.2,
        attemptId: "run-1:0",
      }),
    ).rejects.toThrow();
  });
});

describe("drills.progress", () => {
  it("counts nothing for somebody who has played nothing", async () => {
    const t = harness();
    const progress = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(progress.archetypes).toMatchObject({ asked: 0, answers: 0, askedAgain: 0 });
    expect(progress.deckSpeed).toMatchObject({ asked: 0, answers: 0 });
  });


  // The reading a single accuracy figure cannot give, through the real store:
  // the two mistakes have different denominators, and a player who always
  // answers "the same" scores perfectly on one side and blind on the other.
  it("counts the two mistakes against their own denominators", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Flat One",
      answered: "same",
      correct: "same",
      margin: 0.4,
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      name: "Flat Two",
      answered: "WU",
      correct: "same",
      margin: 0.4,
      attemptId: "run-1:1",
    });
    await record(t, "alice", {
      name: "Sharp One",
      answered: "same",
      correct: "WB",
      margin: 2.5,
      attemptId: "run-1:2",
    });

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes.discrimination).toEqual({
      flat: 2,
      calledSharp: 1,
      sharp: 1,
      calledFlat: 1,
    });
  });

  it("bands the sharp questions by how far past their gate they sat", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Just Past",
      answered: "WB",
      correct: "WB",
      margin: 1.1,
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      name: "Miles Past",
      answered: "WU",
      correct: "WB",
      margin: 4.2,
      attemptId: "run-1:1",
    });

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes.asked).toBe(2);
    // Multiples of the drill's OWN gate -- 1-1.5, 1.5-2, 2+ -- and not error
    // bars, because the archetype quiz's bar moves with the deck count and deck
    // speed's has a second test against the set's own spread.
    expect(archetypes.bins[0]).toMatchObject({ answers: 1, read: 1 });
    expect(archetypes.bins[2]).toMatchObject({ answers: 1, read: 0 });
  });

  // Below the gate the answer is flat by construction, so a band holding one
  // would report willingness to say "the same" rather than a read.
  it("keeps flat questions out of the bands", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Flat",
      answered: "same",
      correct: "same",
      margin: 0.6,
      attemptId: "run-1:0",
    });

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes.asked).toBe(1);
    expect(archetypes.bins.every((b) => b.answers === 0)).toBe(true);
  });

  // A reprint is the same name in two sets with two different answers, and the
  // deal is set-scoped so nothing there would ever notice the merge.
  it("tells one card in two sets apart", async () => {
    const t = harness();
    for (const setCode of ["fdn", "blb"]) {
      await as(t, "alice").mutation(api.drills.answers.record, {
        drill: "archetypes",
        setCode,
        name: "Shock",
        answered: "WB",
        correct: "WB",
        sigmas: 3,
        margin: 2.5,
        attemptId: `run-1:${setCode}`,
      });
    }

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes.asked).toBe(2);
    expect(archetypes.askedAgain).toBe(0);
    expect(archetypes.bins[2]).toMatchObject({ answers: 2, read: 2 });
  });

  // The half core cannot prove on its own: rows written by the real mutation,
  // in the real order, read back through the real index.
  it("splits a real repeat into taken back and still wrong", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Took Back",
      answered: "WU",
      correct: "WB",
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      name: "Took Back",
      answered: "WB",
      correct: "WB",
      attemptId: "run-2:0",
    });
    await record(t, "alice", {
      name: "Still Short",
      answered: "WU",
      correct: "WB",
      attemptId: "run-1:1",
    });
    await record(t, "alice", {
      name: "Still Short",
      answered: "WR",
      correct: "WB",
      attemptId: "run-2:1",
    });

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes).toMatchObject({
      asked: 2,
      answers: 4,
      askedAgain: 2,
      tookBack: 1,
      stillWrong: 1,
    });
    // Exhaustive, so a screen printing one of the two cannot imply a third.
    expect(archetypes.tookBack + archetypes.stillWrong).toBe(archetypes.askedAgain);
  });

  // A first answer is the half memory of a reveal cannot reach, so a retry must
  // not turn a band it was wrong in into a band it was right in.
  it("bands the first answer even when the retry was right", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Took Back",
      answered: "WU",
      correct: "WB",
      margin: 2.5,
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      name: "Took Back",
      answered: "WB",
      correct: "WB",
      margin: 2.5,
      attemptId: "run-2:0",
    });

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes.bins[2]).toMatchObject({ answers: 1, read: 0 });
  });

  // A re-seed can change what a card's decks wanted. Two attempts graded against
  // different answers are two questions wearing one card's name.
  it("drops a pair whose answer moved between the attempts", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Moved",
      answered: "WB",
      correct: "same",
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      name: "Moved",
      answered: "WB",
      correct: "WB",
      attemptId: "run-2:0",
    });

    const { archetypes } = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(archetypes).toMatchObject({ asked: 1, askedAgain: 0, tookBack: 0, stillWrong: 0 });
  });

  // Two subjects, two charts. The rates must not pool even though chance is one
  // third in both drills.
  it("keeps the two drills apart", async () => {
    const t = harness();
    await record(t, "alice", {
      drill: "archetypes",
      name: "Cathar Commando",
      answered: "WB",
      correct: "WB",
      attemptId: "run-1:0",
    });
    await record(t, "alice", {
      drill: "deckSpeed",
      name: "Day of Judgment",
      answered: "fast",
      correct: "slow",
      attemptId: "run-1:1",
    });

    const progress = await as(t, "alice").query(api.drills.progress.progress, {});
    expect(progress.archetypes).toMatchObject({ asked: 1 });
    expect(progress.deckSpeed).toMatchObject({ asked: 1 });
    expect(progress.deckSpeed.discrimination).toMatchObject({ sharp: 1, calledFlat: 0 });
  });

  it("reads only the caller's own answers", async () => {
    const t = harness();
    await record(t, "alice", {
      name: "Cathar Commando",
      answered: "WB",
      correct: "WB",
      attemptId: "run-1:0",
    });

    const progress = await as(t, "bob").query(api.drills.progress.progress, {});
    expect(progress.archetypes.asked).toBe(0);
  });

  it("refuses a caller who is not signed in", async () => {
    const t = harness();
    await expect(t.query(api.drills.progress.progress, {})).rejects.toThrow();
  });
});
