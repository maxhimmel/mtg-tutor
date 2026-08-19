import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";

import {
  authRecovered,
  authStalled,
  draftResumed,
  draftStranded,
  feedbackOpened,
  feedbackRefused,
  identify,
  pickMade,
  settingChanged,
  signedOut,
  statsViewed,
  tokensPreviewed,
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
      authStalled({ route: "/" });
      authRecovered({ route: "/", stalledMs: 1200 });
      tokensPreviewed({ named: 1, withArt: 1, drawn: 1, viewport: 1440 });
      statsViewed({ drafts: 0, picks: 0, detailed: 0, mistakes: 0, forced: 0, truncated: false });
      draftResumed({ sessionId: "s1", setCode: "fdn", format: "TradDraft", picks: 3, agedHours: 2 });
      draftStranded({
        sessionId: "s1",
        setCode: "fdn",
        format: "TradDraft",
        picks: 3,
        missing: 1,
        dealt: 45,
      });
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

  // Read by subtraction in two directions -- named minus withArt is an ingest
  // problem, withArt minus drawn is a layout one -- so all three counts have to
  // arrive under the names the differences are computed from.
  it("names the token event and keeps all three counts apart", () => {
    const seen = { named: 2, withArt: 1, drawn: 0, viewport: 1280 };
    tokensPreviewed(seen);
    expect(capture).toHaveBeenCalledWith("tokens_previewed", seen);
  });

  // These two are read by subtraction -- stalls minus recoveries is the number
  // of people who never got back in -- so a rename does not just break a chart,
  // it silently makes that difference wrong in one direction.
  it("names both halves of the auth stall", () => {
    authStalled({ route: "/draft/[sessionId]" });
    expect(capture).toHaveBeenCalledWith("auth_stalled", { route: "/draft/[sessionId]" });

    authRecovered({ route: "/draft/[sessionId]", stalledMs: 2400 });
    expect(capture).toHaveBeenCalledWith("auth_recovered", {
      route: "/draft/[sessionId]",
      stalledMs: 2400,
    });
  });

  // The empty view is the half of this measurement worth having -- whether the
  // screen is opened by people with nothing on it -- so the guard has to be
  // "was it viewed", never "was there anything to view".
  it("reports a stats view with nothing in it", () => {
    const empty = { drafts: 0, picks: 0, detailed: 0, mistakes: 0, forced: 0, truncated: false };
    statsViewed(empty);
    expect(capture).toHaveBeenCalledWith("stats_viewed", empty);
  });

  // The two halves of what happens to an unfinished draft: it is played on, or
  // it turns out it cannot be. Named here for the reason every other event in
  // this file is -- `draft_resumed` against `draft_started` is the only evidence
  // the resume list was worth building, and a rename leaves the old data behind
  // as an event nothing can be repaired to include.
  it("names the two events an unfinished draft can produce", () => {
    const resumed = {
      sessionId: "s1",
      setCode: "fdn",
      format: "TradDraft",
      picks: 17,
      agedHours: 40,
    };
    draftResumed(resumed);
    expect(capture).toHaveBeenCalledWith("draft_resumed", resumed);

    const stranded = {
      sessionId: "s1",
      setCode: "fdn",
      format: "TradDraft",
      picks: 17,
      missing: 3,
      dealt: 45,
    };
    draftStranded(stranded);
    expect(capture).toHaveBeenCalledWith("draft_stranded", stranded);
  });

  it("resets on sign-out, so the next person is not the last one", () => {
    signedOut();
    expect(reset).toHaveBeenCalled();
  });
});
