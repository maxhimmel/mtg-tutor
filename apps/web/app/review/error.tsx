"use client";

import Link from "next/link";

// A review URL is the one link in this app likely to be kept, pasted or gone
// stale, and every read goes through loadBoard -- which throws for an id that
// does not exist, a draft that belongs to someone else, and a session created
// before auth existed. Without a boundary those all render as a blank page.
export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        That draft could not be opened.
      </h1>
      <p className="mt-4 leading-relaxed text-base-content/70">{error.message}</p>
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
