"use client";

import { COLOR_NAMES, GUILD_NAMES, releaseDate } from "../lib/format";
import { SetIcon } from "./SetIcon";

export interface SetSummary {
  code: string;
  name?: string;
  format: string;
  cardCount: number;
  ratedCardCount: number;
  releasedAt?: string;
  iconUri?: string;
  topPair?: string;
}

// A set's best two-colour lane, drawn in the game's own pips. The name carries
// the meaning, so the symbols are decorative to a screen reader rather than
// read out letter by letter.
function Lane({ pair }: { pair: string }) {
  const colors = [...pair];
  const guild = GUILD_NAMES[pair];
  const spoken = colors.map((c) => COLOR_NAMES[c] ?? c).join(" and ");

  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className="flex items-center gap-0.5 text-[0.8rem]" aria-hidden="true">
        {colors.map((c) => (
          <i key={c} className={`ms ms-${c.toLowerCase()} ms-cost`} />
        ))}
      </span>
      <span className="text-base-content/75">{guild ?? spoken}</span>
    </span>
  );
}

export function SetPlate({
  set,
  starting,
  dimmed,
  onStart,
}: {
  set: SetSummary;
  starting: boolean;
  // Another set is starting, so this one is inert until that resolves.
  dimmed: boolean;
  onStart: () => void;
}) {
  const unrated = set.ratedCardCount === 0;

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={dimmed || starting}
      aria-busy={starting}
      className={`group flex cursor-pointer flex-col items-start gap-3 rounded-box p-4 text-left
        transition-[background-color,opacity] duration-200
        hover:bg-base-200
        focus-visible:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
        disabled:cursor-default ${dimmed ? "opacity-35" : ""}`}
    >
      {/* On a real card the set symbol is printed in the card's rarity -- black
          for a common, gold for a rare. Reaching a set is the same promotion, so
          the symbol sits muted until it is hovered or focused and then goes to
          the theme's gold, which is the same antique the multicolour frames use. */}
      <SetIcon
        uri={set.iconUri}
        className={`size-14 transition-colors duration-200 ${
          starting ? "text-primary" : "text-base-content/60 group-hover:text-primary"
        } group-focus-visible:text-primary`}
      />

      <span className="flex flex-col gap-0.5">
        <span className="font-display text-lg font-semibold leading-tight">
          {set.name ?? set.code.toUpperCase()}
        </span>
        <span className="eyebrow">
          {set.code.toUpperCase()} · {set.format}
        </span>
      </span>

      {starting ? (
        <span className="flex items-center gap-2 text-sm text-primary">
          <span className="loading loading-spinner loading-xs" />
          Opening pack 1…
        </span>
      ) : unrated ? (
        <span className="badge badge-outline badge-warning badge-sm">
          No win-rate data
        </span>
      ) : set.topPair ? (
        <Lane pair={set.topPair} />
      ) : (
        <span className="text-sm text-base-content/40">—</span>
      )}

      <span className="text-xs tabular-nums text-base-content/45">
        {releaseDate(set.releasedAt) ?? "Release date unknown"}
      </span>
    </button>
  );
}
