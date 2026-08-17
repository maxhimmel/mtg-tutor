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
 * Renders nothing at all when there is nothing to resume, which is the normal
 * case and should cost the home page nothing.
 */
export function UnfinishedDrafts({ sets }: { sets?: SetSummary[] }) {
  const drafts = useQuery(api.draft.unfinished, {});
  const discard = useMutation(api.draft.discard);

  // Which row is asking to be sure. Deleting a draft is the only thing in the
  // app that destroys somebody's own work, so the button does not do it -- it
  // asks, in place, where the row is. A dialog would be the heavier answer and
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
      // Beside the row that refused rather than in an alert, for the same
      // reason the set picker renders its refusal in place: the way out should
      // be next to the thing that would not go.
      setFailed(humanError(e));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
        Pick up where you left off
      </h2>

      {failed && (
        <div role="alert" className="alert alert-warning mb-3">
          <span>{failed}</span>
        </div>
      )}

      <div className="card overflow-x-auto border border-base-300 bg-base-200">
        <table className="table">
          <tbody>
            {drafts.map((draft) => {
              const set = icons.get(`${draft.setCode}:${draft.format}`);
              const name = set?.name ?? draft.setCode.toUpperCase();
              const asking = confirming === draft.id;

              return (
                <tr key={draft.id} className="transition-colors hover:bg-base-300/40">
                  <th scope="row" className="font-normal">
                    <span className="flex items-center gap-3">
                      <SetIcon uri={set?.iconUri} className="size-6 text-base-content/50" />
                      <span className="flex flex-col">
                        <span className="font-display font-semibold leading-tight">
                          {name}
                        </span>
                        {/* No "of 42". The denominator is how big this draft's
                            packs were, which lives in its pool row -- see
                            draft.unfinished, which exists not to read it. */}
                        <span className="eyebrow">
                          {draft.setCode.toUpperCase()} · {draft.picks}{" "}
                          {draft.picks === 1 ? "pick" : "picks"} in
                        </span>
                      </span>
                    </span>
                  </th>

                  <td className="whitespace-nowrap tabular-nums text-base-content/70">
                    {releaseDate(draft.createdAt.slice(0, 10)) ?? "—"}
                  </td>

                  <td className="whitespace-nowrap">
                    {asking ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-sm text-base-content/70">
                          Delete this draft and its picks?
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-error"
                          disabled={deleting === draft.id}
                          onClick={() => void remove(draft.id)}
                        >
                          {deleting === draft.id ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/draft/${draft.id}`}
                          className="btn btn-sm btn-primary w-[5.5rem]"
                          onClick={() =>
                            draftResumed({
                              sessionId: draft.id,
                              setCode: draft.setCode,
                              format: draft.format,
                              picks: draft.picks,
                              agedHours:
                                (Date.now() - Date.parse(draft.createdAt)) / 3_600_000,
                            })
                          }
                        >
                          Resume
                        </Link>
                        {/* A challenge names both drafts and is the only thing
                            letting two people read each other's picks, so this
                            one cannot be thrown away -- see draft.discard. Said
                            here rather than left to a button that refuses. */}
                        {draft.promised ? (
                          <span className="px-2 text-sm text-base-content/55">
                            In a challenge
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost text-base-content/60"
                            onClick={() => {
                              setFailed(null);
                              setConfirming(draft.id);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
