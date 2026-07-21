import { describe, it, expect } from "vitest";
import { loadPrinciples } from "./principles.js";
import { buildSystemPrompt } from "./prompt.js";

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
