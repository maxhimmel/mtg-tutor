"use client";

import { useMemo } from "react";
import type { Card } from "@mtg-tutor/core";
import type { Line } from "./useLines";
import type { ReviewPick } from "./types";

// How many other cards the panel offers. Three, because the point is that the
// question is ASKABLE about more than the one card the grade named -- a longer
// list turns a counterfactual into a menu, and every entry costs a replay.
const ALTERNATIVES = 3;

/**
 * The cards worth asking about, the graded one first.
 *
 * `contextBest` leads because it is the card the grade was actually computed
 * against (decision #10), so it is the only one the rest of this screen has
 * already made a claim about. The others are the pack's best by win rate, which
 * is the same ordering the shortlist above uses -- a reader should not have to
 * learn a second ranking to read the row underneath the first one.
 */
function candidates(pick: ReviewPick): Card[] {
  const taken = pick.picked.name;
  const ranked = [...pick.pack]
    .filter((c) => c.name !== taken)
    .sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0));

  const graded = ranked.find((c) => c.name === pick.contextBestName);
  const rest = ranked.filter((c) => c.name !== graded?.name).slice(0, ALTERNATIVES - 1);
  return graded ? [graded, ...rest] : ranked.slice(0, ALTERNATIVES);
}

/**
 * What a pick you did not make would have done to the rest of your draft.
 *
 * The cheapest honest form of the alternate-lines idea: one pick swapped, the
 * pod re-run over the SAME stored boosters, and a count of how many of your
 * later packs came out different. It is a controlled experiment rather than a
 * story -- see `forkImpact` for why the rng makes that true.
 *
 * TWO NUMBERS THAT ARE NOT THE SAME KIND OF CLAIM, and the panel has to say so
 * rather than printing them side by side.
 *
 * `delay` is exact and policy-free. Your own pick cannot reach your own packs
 * until the wheel brings it round, so nothing about what you would have done
 * next is assumed to know it.
 *
 * `reach` is not. Past the wheel the card you really took next may not be in the
 * counterfactual pack, so something has to decide what you would have done, and
 * the answer here is "taken your actual card where it was there, and the pod's
 * own best where it was not". That is an assumption about a person and it is
 * stated on screen, because a reader who thinks this is a measurement will
 * believe a number that is partly a guess.
 *
 * ZERO IS A REAL ANSWER AND IS DRAWN AS ONE. Most single-ply swaps change
 * nothing -- eight bots consuming the same top cards in a different order leave
 * the same cards behind more often than not (see diff.test's seed sweep). A
 * panel that only spoke up when something happened would quietly teach that
 * picks always matter, which is the opposite of what the data says.
 */
export function LineNotTaken({
  pick,
  line,
  onAsk,
}: {
  pick: ReviewPick;
  line: Line | undefined;
  onAsk: (card: string, which: "graded" | "chosen") => void;
}) {
  const options = useMemo(() => candidates(pick), [pick]);
  if (options.length === 0) return null;

  const asked = line?.theirs;
  const state = line?.state;

  return (
    <div className="border-t border-base-300 pt-3">
      <div className="eyebrow mb-1.5">The line not taken</div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-base-content/60">What if you had taken</span>
        {options.map((card) => (
          <button
            key={card.name}
            type="button"
            className={`btn btn-xs ${asked === card.name ? "btn-primary" : "btn-outline"}`}
            onClick={() =>
              // By IDENTITY, never by position. `candidates` only leads with the
              // graded card when it is in the list at all, and it is not
              // whenever the player TOOK it -- the common good-pick case. Keyed
              // on the index, every one of those picks reported the pack's top
              // win rate as "graded", which is the one value this field exists
              // to tell apart from the others.
              onAsk(card.name, card.name === pick.contextBestName ? "graded" : "chosen")
            }
          >
            {card.name}
          </button>
        ))}
        <span className="text-sm text-base-content/60">?</span>
      </div>

      {state === "pending" && (
        <p className="mt-2 flex items-center gap-2 text-sm text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          Re-running the pod…
        </p>
      )}

      {state === null && (
        <p className="mt-2 text-sm text-warning">
          This draft&rsquo;s boosters can no longer be replayed, so the line cannot be run.
        </p>
      )}

      {state && state !== "pending" && (
        // A button press that swaps a spinner for a paragraph is silent to a
        // screen reader, and this one is the whole answer. Same treatment the
        // draft's own after-action panel and the feedback box already use.
        <div className="mt-2 flex flex-col gap-1" aria-live="polite">
          {state.reach === 0 ? (
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Nothing downstream changed.</span> All{" "}
              {state.of} of your later packs came out exactly the same with {asked} in
              your pool instead — the other seats took the same cards regardless.
            </p>
          ) : (
            <p className="text-sm leading-relaxed">
              <span className="font-semibold text-primary">
                {state.reach} of your {state.of} later packs
              </span>{" "}
              would have looked different
              {state.delay != null && (
                <>
                  , starting{" "}
                  <span className="font-semibold">
                    {state.delay} pick{state.delay === 1 ? "" : "s"} later
                  </span>{" "}
                  when it wheeled back round
                </>
              )}
              .
            </p>
          )}

          {/* The assumption, every time, and not behind a tooltip. `reach` is
              the number a reader will quote, and it is the one that is not
              purely a measurement. */}
          {state.reach > 0 && (
            <p className="text-xs text-base-content/50">
              Assumes you drafted the same way afterwards — taking your actual card
              wherever it was still there.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
