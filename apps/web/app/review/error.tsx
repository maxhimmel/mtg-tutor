"use client";

import Link from "next/link";
import { explainedError } from "../lib/humanError";

// A review URL is the one link in this app likely to be kept, pasted or gone
// stale, and every read goes through loadBoard -- which throws for an id that
// does not exist, a draft that belongs to someone else, and a session created
// before auth existed. Without a boundary those all render as a blank page.
//
// This was the one place left in the app rendering a raw `error.message`. Every
// other catch site runs it through humanError, and the reason this one drifted is
// that it never catches anything itself -- React hands it the error, already
// looking like an Error, and `.message` is right there. What it printed was the
// whole server report: request id, function name, four stack frames, and the
// sentence the backend went to the trouble of throwing buried in the middle of
// it. See the note atop convex/sessions.ts for why that sentence exists.
export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only what the backend meant to say. An error with no sentence in it gets a
  // line about what to do instead of its own internals: the heading has already
  // said what happened, and "Failed to fetch dynamically imported module" adds
  // nothing to that for the person reading it.
  const said = explainedError(error);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        That draft could not be opened.
      </h1>

      <p className="mt-4 leading-relaxed text-base-content/70">
        {said ?? "No reason came back with it. Try again — it may have been a bad connection."}
      </p>

      {/* Only set for a failure that happened during the server render, which is
          also the only kind a log could be found for afterwards. */}
      {said == null && error.digest && (
        <p className="mt-2 text-sm text-base-content/45">
          Reference <span className="tabular-nums">{error.digest}</span>
        </p>
      )}

      <div className="mt-7 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/review" className="btn btn-ghost">
          Back to your drafts
        </Link>
      </div>
    </main>
  );
}
