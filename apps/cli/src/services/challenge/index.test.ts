import { describe, expect, it } from "vitest";
import { idFromLink } from "./index.js";

// What somebody actually pastes. They were sent a URL, so the input is a URL --
// and often one with `/diff` on the end, because that is the page they were
// looking at when they copied it. Without this the argument validator rejects
// the string first and the CLI answers a mistyped link with a
// `v.id("challenges")` dump.
describe("idFromLink", () => {
  const ID = "ks7bfz5pc3fv5e0ab2r275xghx8c46rt";

  it("takes a bare id", () => {
    expect(idFromLink(ID)).toBe(ID);
  });

  it("takes the link as sent", () => {
    expect(idFromLink(`https://tutor.example.com/challenge/${ID}`)).toBe(ID);
  });

  it("takes the link with /diff on the end, which is what gets copied", () => {
    expect(idFromLink(`http://localhost:3000/challenge/${ID}/diff`)).toBe(ID);
  });

  it("survives a trailing slash and a query string", () => {
    expect(idFromLink(`http://localhost:3000/challenge/${ID}/?from=email`)).toBe(ID);
  });

  it("trims what a paste brings with it", () => {
    expect(idFromLink(`  ${ID}\n`)).toBe(ID);
  });

  it("refuses anything that cannot be an id, so the caller can say so", () => {
    expect(idFromLink("")).toBeNull();
    expect(idFromLink("nope")).toBeNull();
    expect(idFromLink("https://tutor.example.com/challenge/")).toBeNull();
    // Upper case and punctuation are not in a Convex id.
    expect(idFromLink("KS7BFZ5PC3FV5E0AB2R275XGHX8C46RT")).toBeNull();
  });
});
