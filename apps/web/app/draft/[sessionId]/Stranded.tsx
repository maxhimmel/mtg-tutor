"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { PageShell } from "../../components/PageShell";
import { PageHeading } from "../../components/PageHeading";
import { SetIcon } from "../../components/SetIcon";
import { draftStranded } from "../../lib/analytics";
import { humanError } from "../../lib/humanError";

/**
 * A draft that cannot be played any more, and the way out of it.
 *
 * Re-ingesting a set replaces its card text wholesale, so a card that leaves
 * the pool loses the row this board joins by name -- and a draft in progress
 * goes on holding that card in boosters of its own that nothing can reach to
 * update. See the `stranded` check in DraftBoard for why the board asks the
 * question rather than letting `hydrate` answer it by throwing mid-render.
 *
 * WHAT IT OWES THE PLAYER IS THE TRUTH AND A DOOR. The truth is that this is
 * not their fault and not a bug they can retry past: the packs they were
 * playing no longer exist to be drawn. The door is the delete, which is right
 * here rather than back on the list, because a person who has just been told
 * their draft is over should not have to go and find the button.
 *
 * The cards are named. Nothing can be done with the names, but "your draft
 * broke" and "three cards were taken out of the set since you started" are
 * different sentences, and only the second one is believable.
 *
 * A FINISHED DRAFT LANDS HERE TOO, and for it the delete is not the answer.
 * This screen draws the pool, so a finished draft cannot be drawn either -- but
 * `review.load` reads the rows each pick wrote and rebuilds nothing, so the
 * walkthrough is intact. Telling somebody their draft is broken and putting a
 * delete under it would cost them the half that still works, so the finished
 * case leads with the review and the delete goes quiet.
 */
export function Stranded({
  sessionId,
  setCode,
  format,
  setName,
  setIcon,
  picks,
  missing,
  dealt,
  complete,
}: {
  sessionId: Id<"draftSessions">;
  setCode: string;
  format: string;
  setName?: string;
  setIcon?: string;
  picks: number;
  missing: readonly string[];
  dealt: number;
  /** Whether all the picks were made before the set moved. */
  complete: boolean;
}) {
  const discard = useMutation(api.draft.discard);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Once per mount. The board reloads this screen on every navigation back to
  // it, and the answer does not change between them.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    draftStranded({ sessionId, setCode, format, picks, missing: missing.length, dealt });
  }, [sessionId, setCode, format, picks, missing.length, dealt]);

  async function remove() {
    setFailed(null);
    setDeleting(true);
    try {
      await discard({ sessionId });
      router.push("/");
    } catch (e) {
      setFailed(humanError(e));
      setDeleting(false);
    }
  }

  const shown = missing.slice(0, 5);

  return (
    <PageShell>
      <PageHeading
        icon={<SetIcon uri={setIcon} name={setName} className="size-6 text-base-content/50" />}
        title={setName ?? setCode.toUpperCase()}
      />

      <section className="max-w-2xl py-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {complete ? "This draft's board cannot be drawn" : "This draft can no longer be played"}
        </h2>

        <p className="mt-4 leading-relaxed text-base-content/70">
          {setCode.toUpperCase()} has been re-ingested since you started, and{" "}
          {missing.length === 1 ? "a card" : `${missing.length} cards`} your packs were
          dealt {missing.length === 1 ? "is" : "are"} no longer in the set — so the board
          cannot be drawn.{" "}
          {complete
            ? "The walkthrough still opens: every pick recorded the pack it saw, so the review reads those rows rather than rebuilding anything."
            : `Your ${picks} ${picks === 1 ? "pick is" : "picks are"} still recorded, but there is nothing left to pick from.`}
        </p>

        <p className="mt-3 text-sm text-base-content/55">
          {shown.join(", ")}
          {missing.length > shown.length && `, and ${missing.length - shown.length} more`}.
        </p>

        {failed && (
          <div role="alert" className="alert alert-warning my-4">
            <span>{failed}</span>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <span className="text-sm text-base-content/70">
                Delete this draft and its picks?
              </span>
              <button
                type="button"
                className="btn btn-error"
                disabled={deleting}
                onClick={() => void remove()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
            </>
          ) : (
            <>
              {/* A finished draft leads with the review, and the delete stops
                  being the primary action: the walkthrough is intact, and
                  somebody told their draft is broken should not throw away the
                  half of it that still works. */}
              {complete ? (
                <>
                  <Link href={`/review/${sessionId}`} className="btn btn-primary">
                    Review this draft
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost text-base-content/60"
                    onClick={() => setConfirming(true)}
                  >
                    Delete this draft
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-error"
                    onClick={() => setConfirming(true)}
                  >
                    Delete this draft
                  </button>
                  <Link href="/" className="btn btn-outline">
                    Draft another set
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
