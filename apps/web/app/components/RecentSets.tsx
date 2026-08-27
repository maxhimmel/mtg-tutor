"use client";

import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { releaseDate } from "../lib/format";
import type { PickSource, SetSummary } from "../lib/sets";
import { SetIcon } from "./SetIcon";

/**
 * The sets you keep coming back to, above the twenty-six you do not.
 *
 * A drafter uses three sets and the picker offers all of them in release order,
 * so getting back into yesterday's set was a scan of the whole grid to reach a
 * decision that had already been made. This is that decision, taken once.
 *
 * IT BORROWS THE UNFINISHED STRIP'S ANATOMY ON PURPOSE, and the two are not the
 * same claim. "Pick up where you left off" is a list of DRAFTS -- each chip is a
 * different one, carries its own progress, and resumes. This is a list of SETS,
 * and the ten drafts behind a chip are one chip that starts an eleventh. Same
 * shape because they are the same kind of footnote to the picker; different
 * words and a different verb because a resume and a fresh deal are different
 * things and a strip that blurred them would be worse than no strip.
 *
 * WHICH IS ALSO WHY IT DROPS THE SETS THE STRIP ABOVE IS ALREADY SHOWING. A set
 * with a draft going appears there as a draft to finish, and repeating it here
 * as a set to start would put two chips with the same name and the same symbol
 * on two adjacent lines meaning two different things. The grid still offers a
 * second FDN draft to anyone who wants one; a shortcut that duplicates the line
 * above it is not buying the page anything.
 *
 * A SET THE APP NO LONGER HAS IS DROPPED TOO. `recentSets` answers from your
 * sessions, which outlive a set leaving the deployment -- so a chip is only
 * drawn for a set `sets.list` still carries, because the alternative is a
 * shortcut whose whole job is one click and whose click is a refusal.
 *
 * Renders nothing when there is nothing to offer, which is every new account
 * and should cost the home page nothing.
 */

// Enough to cover the sets somebody is actually rotating between without the
// strip becoming a second picker. Past about five chips this stops being a
// shortcut and starts being a list to read, which is the thing below it.
const SHOWN = 5;

export function RecentSets({
  sets,
  starting,
  onStart,
}: {
  sets?: SetSummary[];
  // Code of the set currently being opened, if any.
  starting: string | null;
  onStart: (setCode: string, format: string, from: PickSource) => void;
}) {
  const recent = useQuery(api.draft.recentSets, {});

  if (!recent || !sets) return null;

  const known = new Map(sets.map((s) => [`${s.code}:${s.format}`, s]));
  const chips = recent
    .filter((r) => !r.open)
    .map((r) => ({ ...r, set: known.get(`${r.setCode}:${r.format}`) }))
    .filter((r): r is typeof r & { set: SetSummary } => r.set != null)
    .slice(0, SHOWN);

  if (chips.length === 0) return null;

  return (
    <section className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* An eyebrow rather than a heading, for the reason the strip above it is
          one: the chips already read as sets, so the words only have to say
          why they are up here rather than down in the grid. */}
      <h2 className="eyebrow shrink-0">Drafted recently</h2>

      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => {
          const name = chip.set.name ?? chip.setCode.toUpperCase();
          const isStarting = starting === chip.setCode;
          const last = releaseDate(chip.lastPlayedAt.slice(0, 10));

          return (
            <li key={`${chip.setCode}:${chip.format}`}>
              {/* The whole chip is the button, unlike the strip above, where the
                  chip holds a link AND a delete and so needs the stretched
                  ::after to keep them apart. There is one action here. */}
              <button
                type="button"
                onClick={() => onStart(chip.setCode, chip.format, "recent")}
                disabled={starting !== null}
                aria-label={`Draft ${name} again`}
                title={last ? `Last drafted ${last}` : undefined}
                className={`group flex items-center gap-2 rounded-field border border-base-300 bg-base-200 py-1 pl-2.5 pr-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  starting === null
                    ? "cursor-pointer hover:border-primary/60"
                    : "cursor-not-allowed opacity-50"
                }`}
              >
                {/* Dim rather than gold. The strip above lights its symbols in
                    the theme's gold to say that draft is live for you; nothing
                    here is live yet, and borrowing that mark would make a set
                    you finished last week look like one you are mid-way
                    through. */}
                <SetIcon
                  uri={chip.set.iconUri}
                  className={`size-4 transition-colors ${
                    isStarting ? "text-primary" : "text-base-content/50"
                  } ${starting === null ? "group-hover:text-primary" : ""}`}
                />
                <span className="font-display text-sm font-semibold leading-tight">
                  {name}
                </span>
                {isStarting && (
                  <span className="loading loading-spinner loading-xs text-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
