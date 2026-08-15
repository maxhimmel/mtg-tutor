import { describe, it, expect } from "vitest";
import { loadPrinciples } from "./principles.js";
import { buildReviewSystemPrompt, buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  const sys = buildSystemPrompt(loadPrinciples());

  it("embeds principle ids so the coach can cite them", () => {
    expect(sys).toContain("[EVAL-01]");
    expect(sys).toContain("[SIG-01]");
  });

  it("instructs the model to cite principle ids", () => {
    expect(sys.toLowerCase()).toContain("cite");
  });
});

// Both prompts feed surfaces that link card names by exact match, so a prompt
// that stops asking for full names silently costs the link on the one card the
// answer is about.
describe("every prompt that gets read as prose", () => {
  const doc = loadPrinciples();

  it("asks for card names in full", () => {
    for (const sys of [buildSystemPrompt(doc), buildReviewSystemPrompt(doc)]) {
      expect(sys).toContain("Write every card name out in full");
    }
  });

  // The web client matches colour shorthand in the answer to redraw it as mana
  // symbols, and it only recognises WUBRG order -- so a prompt that stops asking
  // for it leaves the letters on screen with nothing said about why.
  it("asks for colour combinations in WUBRG order", () => {
    for (const sys of [buildSystemPrompt(doc), buildReviewSystemPrompt(doc)]) {
      expect(sys).toContain("as its letters in WUBRG order");
    }
  });
});
