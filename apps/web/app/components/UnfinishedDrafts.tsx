"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { draftResumed } from "../lib/analytics";
import { humanError } from "../lib/humanError";
import { releaseDate } from "../lib/format";
import type { SetSummary } from "../lib/sets";
import { SetIcon } from "./SetIcon";

/**
 * The drafts you walked away from, on the screen you would walk back in from.
 *
 * ABOVE THE SET PICKER RATHER THAN ON /review, and that is the whole placement
 * argument. /review is where a draft goes to be read once it is over -- its own
 * empty state says a draft becomes reviewable at the forty-fifth pick -- and an
 * unfinished draft is not a thing to read, it is a thing to play. This page is
 * where the app asks "what do you want to draft", and "the one you already
 * started" is a better answer to that question than any set on the grid, so it
 * goes above them rather than beside them.
 *
 * A STRIP OF CHIPS RATHER THAN A TABLE, and that is the size argument. This used
 * to be a bordered card with a table in it under an 18px display heading, which
 * is the exact anatomy of the set list directly below -- so with the picker in
 * list view the page drew two identical tables, and the top one read as the
 * picker's own first rows, headerless and unsortable. It is also the wrong shape
 * on its own terms: a table is built for browsing eighteen of something, and
 * this is one or two bookmarks. A chip strip is a shape neither set view uses,
 * which is what keeps a footnote from looking like the question, and it costs a
 * single line where the card cost about four.
 *
 * The chips carry no set code. `BLB ·` earns its place on the picker, where it
 * supports scanning eighteen rows; here the symbol and the name have both
 * already said which set this is.
 *
 * Renders nothing at all when there is nothing to resume, which is the normal
 * case and should cost the home page nothing.
 */
export function UnfinishedDrafts({ sets }: { sets?: SetSummary[] }) {
  const drafts = useQuery(api.draft.unfinished, {});
  const discard = useMutation(api.draft.discard);

  // Which chip is asking to be sure. Deleting a draft is the only thing in the
  // app that destroys somebody's own work, so the button does not do it -- it
  // asks, in place, where the chip is. A dialog would be the heavier answer and
  // would cover the very list the choice is about.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Only for the set symbol and name, off the list this page has already read.
  // `draft.unfinished` carries the set code and deliberately not its icon.
  const icons = useMemo(
    () => new Map((sets ?? []).map((s) => [`${s.code}:${s.format}`, s])),
    [sets],
  );

  if (!drafts || drafts.length === 0) return null;

  async function remove(id: Id<"draftSessions">) {
    setFailed(null);
    setDeleting(id);
    try {
      await discard({ sessionId: id });
      setConfirming(null);
    } catch (e) {
      // Beside the chip that refused rather than in an alert, for the same
      // reason the set picker renders its refusal in place: the way out should
      // be next to the thing that would not go. A refusal leaves `confirming`
      // set, so the open chip is the one this belongs to and it needs no bar of
      // its own above the strip.
      setFailed(humanError(e));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* An eyebrow rather than a heading. Still an <h2> for the outline, but at
          the scale of a caption: the chips beside it are already legible as
          drafts, so the words only have to say why they are up here. */}
      <h2 className="eyebrow shrink-0">Pick up where you left off</h2>

      <ul className="flex flex-wrap items-center gap-2">
        {drafts.map((draft) => {
          const set = icons.get(`${draft.setCode}:${draft.format}`);
          const name = set?.name ?? draft.setCode.toUpperCase();
          const started = releaseDate(draft.createdAt.slice(0, 10));

          if (confirming === draft.id) {
            return (
              <li
                key={draft.id}
                className="flex flex-wrap items-center gap-2 rounded-field border border-warning/50 bg-base-200 py-1 pl-2.5 pr-1 text-sm"
              >
                <span>Delete {name} and its picks?</span>
                <button
                  type="button"
                  className="btn btn-xs btn-error"
                  disabled={deleting === draft.id}
                  onClick={() => void remove(draft.id)}
                >
                  {deleting === draft.id ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
                {failed && (
                  <span role="alert" className="text-warning">
                    {failed}
                  </span>
                )}
              </li>
            );
          }

          return (
            <li
              key={draft.id}
              className="group relative flex items-center gap-2 rounded-field border border-base-300 bg-base-200 py-1 pl-2.5 pr-1 transition-colors hover:border-primary/60 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-primary"
            >
              {/* The one gold thing on the strip, and it is a mark the page
                  already owns: the picker draws its symbols dim, so a symbol
                  lit in the theme's gold is enough to say this set is live for
                  you without the chip needing a badge or a rule of its own. */}
              <SetIcon
                uri={set?.iconUri}
                className="size-4 text-primary/70 transition-colors group-hover:text-primary"
              />

              {/* The chip is the button, the same anatomy the set list uses: a
                  real link keeps the keyboard and screen-reader path on the
                  name, and its stretched ::after is what makes the whole chip
                  the hit target. */}
              <Link
                href={`/draft/${draft.id}`}
                className="font-display text-sm font-semibold leading-tight after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                onClick={() =>
                  draftResumed({
                    sessionId: draft.id,
                    setCode: draft.setCode,
                    format: draft.format,
                    picks: draft.picks,
                    agedHours: (Date.now() - Date.parse(draft.createdAt)) / 3_600_000,
                  })
                }
              >
                {name}
              </Link>

              {/* No "of 42". The denominator is how big this draft's packs were,
                  which lives in its pool row -- see draft.unfinished, which
                  exists not to read it. */}
              <span className="whitespace-nowrap text-xs tabular-nums text-base-content/55">
                {draft.picks} {draft.picks === 1 ? "pick" : "picks"} in
                {started ? ` · ${started}` : ""}
              </span>

              {/* A challenge names both drafts and is the only thing letting two
                  people read each other's picks, so this one cannot be thrown
                  away -- see draft.discard. Said here rather than left to a
                  button that refuses. */}
              {draft.promised ? (
                <span className="whitespace-nowrap px-1.5 text-[0.6875rem] text-base-content/45">
                  In a challenge
                </span>
              ) : (
                // A bin rather than an X. An X on a chip means dismiss it, and
                // this destroys a draft -- the glyph has to mean the thing the
                // confirm is about to ask about.
                <button
                  type="button"
                  className="btn btn-square btn-ghost btn-xs relative text-base-content/35 hover:text-error"
                  aria-label={`Delete your ${name} draft`}
                  title={`Delete your ${name} draft`}
                  onClick={() => {
                    setFailed(null);
                    setConfirming(draft.id);
                  }}
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.75 4.25h10.5" />
                    <path d="M6.25 4.25V2.75h3.5v1.5" />
                    <path d="M4.5 4.25v8a.75.75 0 0 0 .75.75h5.5a.75.75 0 0 0 .75-.75v-8" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
