import { describe, it, expect } from "vitest";
import { mulberry32, newSeed } from "./rng.js";

describe("mulberry32", () => {
  it("is deterministic: same seed yields the same sequence", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("stays within [0, 1)", () => {
    const r = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("mulberry32 state", () => {
  it("resuming from state() continues the identical sequence", () => {
    const live = mulberry32(42);
    for (let i = 0; i < 17; i++) live();

    // Snapshot mid-stream, then draw from both and compare.
    const resumed = mulberry32(live.state());
    const fromLive = Array.from({ length: 20 }, () => live());
    const fromResumed = Array.from({ length: 20 }, () => resumed());

    expect(fromResumed).toEqual(fromLive);
  });

  it("state() is a serializable 32-bit unsigned integer", () => {
    const r = mulberry32(0xdeadbeef);
    for (let i = 0; i < 5; i++) r();
    const s = r.state();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    expect(JSON.parse(JSON.stringify({ s })).s).toBe(s);
  });
});

describe("newSeed", () => {
  it("returns a 32-bit unsigned integer", () => {
    const s = newSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
