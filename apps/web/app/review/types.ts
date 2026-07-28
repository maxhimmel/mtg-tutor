import type { FunctionReturnType } from "convex/server";
import type { api } from "@mtg-tutor/backend";

// Taken off the query rather than off core's StoredDraft/StoredPick. The two
// describe the same thing, but only this one is guaranteed to be what actually
// crosses the wire -- the CLI has to cast between them, and there is no reason
// for a second surface to inherit that cast.
export type ReviewDraft = FunctionReturnType<typeof api.review.load>;
export type ReviewPick = ReviewDraft["picks"][number];
