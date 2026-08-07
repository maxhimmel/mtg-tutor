import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";

import {
  feedbackOpened,
  feedbackRefused,
  identify,
  pickMade,
  settingChanged,
  signedOut,
} from "./analytics";

// The seam's whole contract is "call the SDK, or do nothing at all", so the SDK
// is the thing to spy on.
const capture = vi.spyOn(posthog, "capture").mockImplementation(() => undefined as never);
const identified = vi.spyOn(posthog, "identify").mockImplementation(() => undefined);
const reset = vi.spyOn(posthog, "reset").mockImplementation(() => undefined);

const loaded = (yes: boolean) => {
  (posthog as unknown as { __loaded: boolean }).__loaded = yes;
};

const pick = {
  sessionId: "s1",
  pickIndex: 3,
  packNo: 1,
  pickNo: 4,
  ceremony: "challenge" as const,
  score: 82,
  grade: "B+",
  isBest: false,
  onColor: true,
  rankInPack: 2,
  packSize: 12,
  benched: false,
  carried: true,
  msDeliberating: 9100,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => loaded(false));

describe("without a project token", () => {
  // The state every local dev run and every fresh clone is in. It has to be
  // silent rather than throwing, because these calls sit on the pick path --
  // an analytics failure must never cost somebody their draft.
  beforeEach(() => loaded(false));

  it("sends nothing and does not throw", () => {
    expect(() => {
      pickMade(pick);
      identify("user_01", "friend@example.com");
      signedOut();
      settingChanged("pickCeremony", "passive", "board");
      feedbackOpened({ surface: "coach", source: "ai", route: "/draft/[sessionId]" });
      feedbackRefused({ surface: "coach", reason: "rate", message: "no" });
    }).not.toThrow();

    expect(capture).not.toHaveBeenCalled();
    expect(identified).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});

describe("with a project token", () => {
  beforeEach(() => loaded(true));

  it("captures a pick under a stable name, with its properties intact", () => {
    pickMade(pick);
    expect(capture).toHaveBeenCalledWith("pick_made", pick);
  });

  // Renaming one of these breaks a chart in PostHog that cannot be repaired
  // retroactively, so the names are asserted rather than left to a refactor.
  it("names the settings event and flattens the triple into properties", () => {
    settingChanged("pickCeremony", "passive", "board");
    expect(capture).toHaveBeenCalledWith("setting_changed", {
      key: "pickCeremony",
      value: "passive",
      where: "board",
    });
  });

  it("identifies on the WorkOS id and passes the email as a person property", () => {
    identify("user_01H", "friend@example.com");
    expect(identified).toHaveBeenCalledWith("user_01H", { email: "friend@example.com" });
  });

  // WorkOS types email as optional, and `{ email: undefined }` would write an
  // empty property onto the person rather than leaving it unset.
  it("omits the properties entirely when there is no email", () => {
    identify("user_01H");
    expect(identified).toHaveBeenCalledWith("user_01H", undefined);
  });

  // Same reason as the settings event above: the two feedback events the browser
  // owns are what "did anybody use this, and did the form stop them" is read off,
  // and a rename would split each chart in two with no way to rejoin them.
  it("names the two feedback events the browser owns", () => {
    const opened = { surface: "coach" as const, source: "ai" as const, route: "/draft/[sessionId]" };
    feedbackOpened(opened);
    expect(capture).toHaveBeenCalledWith("feedback_opened", opened);

    const refused = { surface: "general" as const, reason: "rate" as const, message: "tomorrow" };
    feedbackRefused(refused);
    expect(capture).toHaveBeenCalledWith("feedback_refused", refused);
  });

  it("resets on sign-out, so the next person is not the last one", () => {
    signedOut();
    expect(reset).toHaveBeenCalled();
  });
});
