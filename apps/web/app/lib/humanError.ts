import { ConvexError } from "convex/values";

// The sentence out of a thrown Convex error, without the transport around it.
//
// The backend throws ConvexError carrying a human string precisely so a client
// can show it (see the note atop convex/sessions.ts). But `error.message` on
// the reconstructed client-side error is the whole server report -- request id,
// function name, file and line, "Called by client" -- with the sentence buried
// in the middle of it. `error.data` is the string that was actually thrown.
//
//   message: [CONVEX M(draft:start)] [Request ID: 7d0e…] Server Error
//            Uncaught ConvexError: You have used your 3 drafts for today.
//            at enforce (../../convex/quota.ts:80:0) … Called by client
//   data:    You have used your 3 drafts for today. The next one unlocks in
//            about 5 hours.
//
// Anything that is not a ConvexError never had a payload, and its message is
// the best there is.
export function humanError(error: unknown): string {
  return explainedError(error) ?? (error instanceof Error ? error.message : String(error));
}

/**
 * The same sentence, or null where the app was never given one.
 *
 * `humanError` always returns something, because its callers are catches sitting
 * beside the control that just failed: the person pressed a button, the button
 * did not work, and even a rough message is better than silence there because
 * the surrounding page supplies the context.
 *
 * An error boundary has no such context -- it has replaced the whole page, and
 * the only thing it can say is whatever the error carried. So it needs to know
 * the difference. A chunk that failed to load or a TypeError from a bad render
 * has no sentence in it, only "Failed to fetch dynamically imported module: …",
 * which is a note to a developer printed where a reader is standing.
 */
export function explainedError(error: unknown): string | null {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return null;
}
