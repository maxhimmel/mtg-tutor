"use client";

import type { ValueTerm } from "@mtg-tutor/core";
import { pct, points } from "../lib/format";

/**
 * What each term of the score MEANS, in words a person would use.
 *
 * The labels `contextValue` emits are field names -- "archetype", "splash",
 * "off-color", "trust" -- and they are the right thing to store: a chart in
 * PostHog and a line in the coach prompt both key off them, and renaming one
 * later would orphan both. They are not the right thing to show. "trust" in
 * particular tells a reader nothing, and this app has a standing complaint
 * (Ideas #13) about exactly this register of jargon leaking onto the screen.
 *
 * Unknown labels fall through to the raw string rather than being dropped. A
 * term added to the scorer and not to this map is then visible and ugly, which
 * is the failure mode to want: silently hiding it would mean the breakdown
 * stopped summing to the total with nothing on screen to say so.
 */
const TERM_COPY: Record<string, { label: string; why: string }> = {
  archetype: {
    label: "Archetype fit",
    why: "How this card does in decks your colours, against how it does everywhere.",
  },
  splash: {
    label: "Splash cost",
    why: "The measured win rate a deck gives up to run the extra colour.",
  },
  "off-color": {
    label: "Your deck can't cast it",
    why: "Charged its whole value — a card that never makes the deck adds nothing.",
  },
  trust: {
    label: "Rarely maindecked",
    why: "Its win rate was measured only on the games somebody chose to play it, so it is pulled back toward the format.",
  },
};

/**
 * One signed contribution, drawn as a diverging bar about a shared zero.
 *
 * Diverging rather than a plain bar because the reader's question is polarity
 * first and magnitude second -- did this help or hurt -- and a row of bars all
 * growing rightward answers that only in the label. The centre rule is the
 * neutral midpoint; the two halves are the app's own success/error pair, which
 * is what every other good/bad signal on these screens already uses.
 *
 * The VALUE stays in ink rather than taking the bar's colour. Sign is already
 * carried typographically by the +/− that `points` emits, so colouring the
 * number too would make the hue the only thing saying it for a reader who
 * cannot separate the two -- and the bar beside it is doing that job.
 */
function TermBar({ term, max }: { term: ValueTerm; max: number }) {
  const copy = TERM_COPY[term.label];
  const share = max > 0 ? Math.abs(term.delta) / max : 0;
  const up = term.delta > 0;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] items-center gap-x-2">
      <span className="truncate text-xs text-base-content/70" title={copy?.why}>
        {copy?.label ?? term.label}
      </span>

      {/* Two equal halves so zero is the same x on every row, whatever the
          widest term happens to be. Bars grow OUT from that rule, so length is
          magnitude and side is sign, and neither has to be read off the other. */}
      <span aria-hidden className="grid h-1.5 grid-cols-2 items-stretch">
        <span className="flex justify-end border-r border-base-content/25">
          {!up && (
            <span
              className="rounded-l-sm bg-error/70"
              style={{ width: `${share * 100}%` }}
            />
          )}
        </span>
        <span className="flex justify-start">
          {up && (
            <span
              className="rounded-r-sm bg-success/70"
              style={{ width: `${share * 100}%` }}
            />
          )}
        </span>
      </span>

      <span className="text-right text-xs tabular-nums text-base-content/70">
        {points(term.delta)}
      </span>
    </li>
  );
}

/**
 * How the number under the grade was arrived at.
 *
 * `contextValue` has always returned its own working -- `base` plus a named,
 * signed term for every adjustment, sorted largest first, summing exactly to the
 * value the grade is computed from. For the whole life of that field the only
 * thing that ever read it was the coach PROMPT: the model was told why a card
 * was worth what it was, and the player looking at the same panel was not.
 *
 * `base` and `total` are win rates and are drawn as rates; the terms between
 * them are DIFFERENCES of two rates and are drawn as points, the same
 * distinction `points` exists for and the same one the verdict's gap makes one
 * panel up. Rendering a delta as a percentage is how a reader comes to think a
 * 4pp charge is a 4% one.
 *
 * ABSENT AND EMPTY ARE DIFFERENT ANSWERS, which is the only real subtlety here.
 * `[]` means the deck made no difference to this card -- which is the ordinary
 * answer at the first pick of a draft, where `commitment` is 0 by construction
 * and zeroes all three colour terms. `undefined` means the row never recorded
 * any, which is now only true of rows written before `recordPick` stopped
 * dropping the empty case.
 *
 * That is worth stating because it was FALSE when this component was written.
 * `recordPick` omitted `terms` whenever the array was empty -- a real saving in
 * bytes and a total loss of the distinction -- so every stored `[]` arrived as
 * `undefined` and this panel told people their P1P1 predated a field it did not.
 * Trap #9 in the writer, caught in review. The read side here was always right;
 * it was being lied to.
 */
export function ScoreBreakdown({
  base,
  total,
  terms,
}: {
  /** What the card is worth on its own -- `PickScore.pickedValue`. */
  base: number;
  /** What it was worth to this deck -- `PickScore.pickedContextValue`. */
  total: number;
  terms: readonly ValueTerm[] | undefined;
}) {
  // `== null`, catching undefined and null alike. Convex strips an unset optional
  // and hands back undefined, but the field crosses a serialisation boundary and
  // the test harness spells the same absence as null -- and the branch below this
  // one reads `.length`, so guessing wrong here is a crash rather than a wrong
  // sentence.
  if (terms == null) {
    return (
      <p className="text-xs leading-relaxed text-base-content/50">
        This pick was recorded before the score kept its working, so there is nothing to
        show.
      </p>
    );
  }

  if (terms.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-base-content/60">
        Nothing adjusted it: your deck made no difference to this card, so the grade used
        its own win rate of {pct(base)}.
      </p>
    );
  }

  const max = Math.max(...terms.map((t) => Math.abs(t.delta)));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-base-content/60">Its own win rate</span>
        <span className="tabular-nums text-base-content/70">{pct(base)}</span>
      </div>

      <ol className="flex flex-col gap-1">
        {terms.map((term) => (
          <TermBar key={term.label} term={term} max={max} />
        ))}
      </ol>

      <div className="flex items-baseline justify-between gap-2 border-t border-base-300 pt-1.5 text-xs">
        <span className="font-semibold">What it was worth here</span>
        <span className="font-semibold tabular-nums">{pct(total)}</span>
      </div>
    </div>
  );
}
