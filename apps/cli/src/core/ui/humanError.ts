import { ConvexError } from "convex/values";

// The sentence out of a thrown Convex error, without the transport around it.
//
// The backend throws ConvexError carrying a human string precisely so a client
// can show it (see the note atop convex/sessions.ts). But `error.message` on the
// reconstructed client-side error is the whole server report -- request id,
// function name, file and line, "Called by client" -- with the sentence buried
// in the middle. `error.data` is the string that was actually thrown.
//
// Duplicated from the web app's copy rather than shared, for the same reason
// CoachUnavailable is: this is each client's own reading of a transport, and
// core takes no runtime dependencies -- least of all on convex.
export function humanError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return error instanceof Error ? error.message : String(error);
}
