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
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return error instanceof Error ? error.message : String(error);
}
