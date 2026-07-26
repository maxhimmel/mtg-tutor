import { describe, it, expect } from "vitest";
import { splitCitations } from "./citations.js";
import { loadPrinciples } from "./principles.js";

describe("splitCitations", () => {
  const doc = loadPrinciples();
  const split = (text: string) => splitCitations(text, doc);

  it("leaves uncited prose untouched", () => {
    const text = "You took Sunspine Lynx; the data favors Bake into a Pie.";
    expect(split(text)).toEqual({ prose: text, principles: [] });
  });

  it("lifts a trailing citation out of the prose", () => {
    const { prose, principles } = split("An unanswered bomb usually wins. [EVAL-02]");
    expect(prose).toBe("An unanswered bomb usually wins.");
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02"]);
    expect(principles[0].text).toContain("bomb");
  });

  it("keeps multiple citations in the order they appear", () => {
    const { principles } = split("Fine pick [EVAL-02] and you are still open [SIG-01].");
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02", "SIG-01"]);
  });

  it("deduplicates an id cited more than once", () => {
    const { principles } = split("Bombs win [EVAL-02], so take the bomb [EVAL-02].");
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02"]);
  });

  it("drops an invented id without leaving a badge or a token", () => {
    const { prose, principles } = split("Trust me on this one. [XYZ-99]");
    expect(prose).toBe("Trust me on this one.");
    expect(principles).toEqual([]);
  });

  it("repairs the space a mid-sentence citation leaves behind", () => {
    const { prose } = split("Removal is premium [EVAL-03] in every archetype.");
    expect(prose).toBe("Removal is premium in every archetype.");
  });

  it("does not strand a space before punctuation", () => {
    const { prose } = split("Take the bomb [EVAL-02], then reassess [SIG-11].");
    expect(prose).toBe("Take the bomb, then reassess.");
  });

  it("tolerates the spacing the model actually emits", () => {
    const observed =
      "Muldrotha is a powerful, high‑cost engine but at pick 2 its 6‑mana curve makes it a " +
      "slower bomb than the 2-drop Burst Lightning [ EVAL-02 ]. Stick with the best absolute " +
      "power early and stay open [ SIG-01 ].";
    const { prose, principles } = split(observed);
    expect(prose).not.toContain("[");
    expect(prose).toContain("high‑cost");
    expect(prose.endsWith("stay open.")).toBe(true);
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02", "SIG-01"]);
  });

  it("accepts parentheses and comma-separated ids", () => {
    const { prose, principles } = split("Take the bomb (EVAL-02, SIG-01) and move on.");
    expect(prose).toBe("Take the bomb and move on.");
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02", "SIG-01"]);
  });

  it("resolves an id spelled with a typographic hyphen", () => {
    const { principles } = split("Bombs win. [ EVAL‑02 ]");
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02"]);
  });

  it("catches an id the model left unbracketed", () => {
    const { prose, principles } = split("Bombs win the game. EVAL-02");
    expect(prose).toBe("Bombs win the game.");
    expect(principles.map((p) => p.id)).toEqual(["EVAL-02"]);
  });

  it("leaves bracketed prose that is not a citation alone", () => {
    const text = "Take the removal [the data disagrees, but only slightly].";
    expect(split(text)).toEqual({ prose: text, principles: [] });
  });

  it("hides a citation still arriving from the stream", () => {
    expect(split("Bombs win the game. [EVA").prose).toBe("Bombs win the game.");
    expect(split("Bombs win the game. [").prose).toBe("Bombs win the game.");
  });

  it("never shows a bracket at any point during streaming", () => {
    const whole = "Bombs win the game. [EVAL-02] Stay open though. [SIG-01]";
    for (let i = 1; i <= whole.length; i++) {
      expect(split(whole.slice(0, i)).prose).not.toContain("[");
    }
    expect(split(whole).principles.map((p) => p.id)).toEqual(["EVAL-02", "SIG-01"]);
  });

  it("preserves the line breaks of the deterministic fallback", () => {
    const { prose } = split("✅ Best available.\n⚠️ Off your committed colors. [MANA-05]");
    expect(prose).toBe("✅ Best available.\n⚠️ Off your committed colors.");
  });

  it("handles a citation opening the response", () => {
    const { prose, principles } = split("[SIG-01] Early picks are expendable.");
    expect(prose).toBe("Early picks are expendable.");
    expect(principles.map((p) => p.id)).toEqual(["SIG-01"]);
  });
});
