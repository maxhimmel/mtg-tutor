import { describe, it, expect } from "vitest";
import { loadPrinciples } from "./principles.js";

describe("loadPrinciples", () => {
  const doc = loadPrinciples();

  it("parses the canonical YAML with a full corpus", () => {
    expect(doc.principles.length).toBeGreaterThan(30);
    expect(doc.meta.title).toContain("Limited");
  });

  it("every principle has id, text, and category", () => {
    for (const p of doc.principles) {
      expect(p.id).toBeTruthy();
      expect(p.text).toBeTruthy();
      expect(p.category).toBeTruthy();
    }
  });

  it("ids are unique", () => {
    const ids = doc.principles.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
