/**
 * One bit, carried from a route handler to a page that can report it.
 *
 * app/callback/route.ts recovers a state-less callback by bouncing it through
 * /sign-in, and that recovery is silent by design -- the friend sees a sign-in
 * that worked. A route handler has no PostHog, so the fact has to survive a
 * cross-origin round trip to reach the browser, which is what a cookie is for
 * and what a query param would not be: /sign-in discards the URL it was called
 * with when it redirects to AuthKit.
 *
 * Deliberately not httpOnly, because the only reader is the browser. SameSite
 * Lax is enough: every hop back from AuthKit is a top-level GET navigation.
 */
export const SIGN_IN_RESTARTED_COOKIE = "mtg-signin-restarted";
