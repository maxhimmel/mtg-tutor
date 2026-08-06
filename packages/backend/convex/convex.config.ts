import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import posthog from "@posthog/convex/convex.config.js";

// The app's first Convex component, and it is here rather than hand-rolled
// because the one hard part of a daily quota is that consuming has to be
// transactional with the thing being paid for. A counter row patched next to
// an insert can charge for a draft that then fails to start; the component's
// consumption rolls back with the mutation it was called in.

// The second one. Analytics is a component rather than a fetch in an action
// because credentials live on the component and are read inside it, so no call
// site has to be handed a token, and because Convex runs backend code as
// short-lived isolates -- posthog-node's flush-on-shutdown has nowhere to hang.
//
// POSTHOG_PROJECT_TOKEN is required because the component declares it that way
// and Convex refuses the push if an optional parent var is wired to a required
// component one -- "env var POSTHOG_PROJECT_TOKEN is required, but parent env var
// POSTHOG_PROJECT_TOKEN is optional", which is a deploy-time error rather than
// something to discover later.
//
// So the variable MUST exist on every deployment before this file reaches it.
// That is not a nicety: vercel.json runs `convex deploy` as the FIRST step of
// the web build, so an unset prod variable does not break analytics, it breaks
// the site. `npx convex env set POSTHOG_PROJECT_TOKEN ... --prod` comes before
// the deploy, not after it.
//
// An empty string is the way to switch analytics off on a deployment that has to
// declare the variable anyway -- see analytics.ts, which treats empty as off so a
// dev deployment does not have to send its noise into the real project.
//
// POSTHOG_PERSONAL_API_KEY is deliberately not declared. It exists to enable
// local feature-flag evaluation, which nothing here uses.
//
// What that costs us, stated precisely, because the component's own cron is the
// one piece of this that runs whether we use it or not. crons.ts registers
// `ensureRefreshLoop` unconditionally on a fixed 5-minute interval -- a cron's
// cadence is fixed at registration and Convex only forwards component env vars at
// runtime, so it cannot gate itself at registration time. Its handler's first
// line is `if (!localEvaluationEnabled()) return`, so with no personal API key
// each tick is one mutation that returns before reading anything: ~8,600
// invocations a month against a 1M free tier, and no database traffic.
//
// The every-60-seconds refresh people worry about is a different thing -- the
// self-rescheduling refreshLoop chain -- and it only ever starts when
// POSTHOG_PERSONAL_API_KEY is set. Not declaring the variable means it cannot be
// set, so that loop cannot start.
const app = defineApp({
  env: {
    POSTHOG_PROJECT_TOKEN: v.string(),
    POSTHOG_HOST: v.optional(v.string()),
  },
});

app.use(rateLimiter);
app.use(posthog, {
  env: {
    POSTHOG_PROJECT_TOKEN: app.env.POSTHOG_PROJECT_TOKEN,
    POSTHOG_HOST: app.env.POSTHOG_HOST,
  },
});

export default app;
