import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { explainedError, humanError } from "./humanError";

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

describe("explainedError", () => {
  // The bug this exists for: the review boundary printed a whole server report
  // -- "[CONVEX Q(review:load)] [Request ID: 56f4…] Server Error Uncaught
  // ConvexError: You need to be signed in to do that. at requireUserId … Called
  // by client" -- as the page's only sentence.
  it("takes the payload off a ConvexError", () => {
    const thrown = new ConvexError("You need to be signed in to do that.");
    thrown.message =
      "[CONVEX Q(review:load)] [Request ID: 56f4] Server Error Uncaught ConvexError: " +
      "You need to be signed in to do that. at requireUserId " +
      "(../../convex/sessions.ts:22:18) Called by client";

    expect(explainedError(thrown)).toBe("You need to be signed in to do that.");
  });

  // The whole point of the split: where humanError would hand back the raw
  // message, a boundary needs to know there was nothing to say and write its
  // own line. A chunk that failed to load is the common case.
  it("is null when nothing human was thrown", () => {
    const chunk = new Error("Failed to fetch dynamically imported module: /_next/static/x.js");
    expect(explainedError(chunk)).toBeNull();
    expect(humanError(chunk)).toBe(chunk.message);
  });

  it("is null for a ConvexError carrying a payload that is not a sentence", () => {
    expect(explainedError(new ConvexError({ kind: "RateLimitError" }))).toBeNull();
  });
});
