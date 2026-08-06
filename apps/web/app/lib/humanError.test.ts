import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { humanError } from "./humanError";

describe("humanError", () => {
  // The bug this exists for: a quota refusal rendered as the whole server
  // report, request id and stack frames included, with the sentence in the
  // middle of it.
  it("takes the payload off a ConvexError, not its message", () => {
    const thrown = new ConvexError("You have used your 3 drafts for today.");
    // What Convex does to it in transit: the payload survives, the message
    // becomes the server's own report of the failure.
    thrown.message =
      "[CONVEX M(draft:start)] [Request ID: 7d0e] Server Error Uncaught " +
      "ConvexError: You have used your 3 drafts for today. at enforce " +
      "(../../convex/quota.ts:80:0) Called by client";

    expect(humanError(thrown)).toBe("You have used your 3 drafts for today.");
  });

  // ConvexError can carry any Value. Only a string is a sentence; an object
  // would render as [object Object], which is worse than the raw message.
  it("falls back to the message when the payload is not a string", () => {
    const thrown = new ConvexError({ kind: "RateLimitError", retryAfter: 1000 });
    thrown.message = "[CONVEX M(x)] Server Error";
    expect(humanError(thrown)).toBe("[CONVEX M(x)] Server Error");
  });

  it("reads a plain Error's message", () => {
    expect(humanError(new Error("network died"))).toBe("network died");
  });

  it("stringifies anything else", () => {
    expect(humanError("just a string")).toBe("just a string");
  });
});
