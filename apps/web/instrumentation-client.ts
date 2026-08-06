import posthog from "posthog-js";

import { env } from "./app/env";

// Analytics initialisation. Next runs this file once, in the browser, before the
// app renders -- which is why it is here rather than in a provider: session
// replay starts at the first paint instead of after React has hydrated.
//
// Read through ./app/env rather than process.env, for the reason that file
// gives: it is the single boundary that touches the raw environment. A missing
// key is not an error. Local dev and a fresh clone have none and should send
// nothing, so this no-ops and lib/analytics.ts stays quiet with it.
if (env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    // The rewrite in next.config.ts, not PostHog's own host. ui_host is only
    // where the toolbar's "open in PostHog" links point, and is not proxied.
    api_host: "/mv3",
    ui_host: "https://us.posthog.com",

    // Load-bearing, not boilerplate. Two of the behaviours it switches on are
    // the difference between this working and half-working here:
    //
    //   capture_pageview: "history_change" -- the App Router navigates without
    //   a page load, so on the older default every route after the first one is
    //   invisible. /review -> /review/[id] would never register.
    //
    //   external_scripts_inject_target: "head" -- exists specifically to stop
    //   the replay and survey bundles from causing React hydration errors when
    //   they are appended to a server-rendered body.
    defaults: "2026-05-30",

    // No session_recording block on purpose. The default is what we want: text
    // is captured, so a replay shows which cards were in the pack and what the
    // coach said, while every input and textarea is masked -- which covers the
    // one free-text field in the app, the defense a player types in Commitment.
    // That text is already stored as draftPicks.defense.reason if it is needed.
  });
}
