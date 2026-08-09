import { describe, expect, it } from "vitest";
import { staleAgainst } from "../convex/sessions.js";

// The tri-state is the whole point: "we cannot tell" must not read as "fine".
// A caller writing `if (stale)` gets the safe answer for a genuinely stale
// draft and the wrong one for an unknowable draft, which is why the unknown
// arm is asserted to be undefined rather than merely falsy.
describe("staleAgainst", () => {
  it("is false when the set has not moved", () => {
    expect(staleAgainst("abc", "abc")).toBe(false);
  });

  it("is true when the set has been re-ingested under a new hash", () => {
    expect(staleAgainst("abc", "def")).toBe(true);
  });

  it("is unknowable when the session predates the stamp", () => {
    expect(staleAgainst(undefined, "abc")).toBeUndefined();
  });

  it("is unknowable when the set was ingested with no artifact to hash", () => {
    expect(staleAgainst("abc", undefined)).toBeUndefined();
  });

  it("does not call two absent hashes equal", () => {
    // The trap: `undefined === undefined` is true, so a naive comparison calls
    // a draft fresh precisely when it knows least about it.
    expect(staleAgainst(undefined, undefined)).toBeUndefined();
  });
});
