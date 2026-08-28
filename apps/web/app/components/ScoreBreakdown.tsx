"use client";

import type { ValueTerm } from "@mtg-tutor/core";
import { pct, points } from "../lib/format";
import { INK } from "../charts/ink";

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
    label: "What the archetype wants",
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
 * How wide a point of win rate is, in pixels, on every breakdown in the app.
 *
 * THE SCALE IS FIXED AND THAT IS THE ENTIRE FIX. These bars were normalised to
 * the largest term IN THEIR OWN PICK, so a full-width bar meant "the biggest
 * thing that happened here" and nothing more. The breakdown page stacks
 * twenty-five of these down one scroll, and cross-row comparison is the natural
 * reading of a stacked column of bars -- so a +0.4pp term on pick 3 and a +6pp
 * term on pick 19 drew identically, one above the other. Worse, the panel's own
 * docblock promises the terms SUM to the value the grade is computed from, and
 * a per-pick scale is exactly what makes that unprovable: the bars could not
 * reconcile with the two rates printed above and below them, which is the one
 * property this panel exists to demonstrate.
 *
 * WHY THE TRACK STOPS AT 8pp WHEN ONE TERM GOES TO FIFTY. `off-color` is
 * `−commitment × cardValue` (`scoring/context.ts`), so a fully committed deck
 * charges a card its ENTIRE win rate -- `context.test.ts` pins it at −0.5 for a
 * card worth 0.500. Sizing the track for that would draw every archetype and
 * splash term, which live in the low single points, as a sliver of a pixel: the
 * common case made unreadable to keep the rare one on the page.
 *
 * So the track holds the range these terms actually work in, and anything past
 * it runs off the end WITH A MARK SAYING SO. That is the same ruling the
 * glossary's grade ruler needed: a scale that stops short of its data is fine,
 * a scale that stops short and looks complete is not. When a bar is clamped the
 * panel is not claiming a magnitude -- the number beside it is -- and "your deck
 * cannot cast it" is a sentence the label already carries in full.
 */
const PX_PER_PP = 5.5;
const MAX_PP = 8;

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
const TRACK = MAX_PP * PX_PER_PP;

/**
 * One arm of a diverging bar, and the mark that says it ran out of track.
 *
 * A clamped bar and a bar that happens to reach the end are the same picture,
 * which is the failure this whole component was rebuilt to stop making. The
 * clamped one loses its rounded cap and gains a torn edge, so the two are told
 * apart at the one place a reader is already looking -- the tip.
 */
function Arm({ pp, side, strong }: { pp: number; side: "up" | "down"; strong?: boolean }) {
  const over = pp > MAX_PP;
  const width = Math.min(pp, MAX_PP) * PX_PER_PP;
  const tone = side === "up" ? "bg-success" : "bg-error";

  return (
    <span
      className={`${tone} ${strong ? "" : "/70"} ${
        over
          ? // Torn rather than capped: the bar is cut off mid-stroke, which is
            // what running past the end of a scale looks like.
            side === "up"
            ? "[clip-path:polygon(0_0,100%_0,88%_50%,100%_100%,0_100%)]"
            : "[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,12%_50%)]"
          : side === "up"
            ? "rounded-r-sm"
            : "rounded-l-sm"
      }`}
      style={{ width }}
    />
  );
}

function Track({
  delta,
  strong,
}: {
  delta: number;
  strong?: boolean;
}) {
  const pp = Math.abs(delta) * 100;
  const up = delta > 0;

  // Two equal halves so zero is the same x on every row, whatever the widest
  // term happens to be. Bars grow OUT from that rule, so length is magnitude
  // and side is sign, and neither has to be read off the other.
  return (
    <span
      aria-hidden
      className="grid h-1.5 items-stretch"
      style={{ gridTemplateColumns: `${TRACK}px ${TRACK}px` }}
    >
      <span className="flex justify-end border-r" style={{ borderColor: INK.zero }}>
        {!up && <Arm pp={pp} side="down" strong={strong} />}
      </span>
      <span className="flex justify-start">
        {up && <Arm pp={pp} side="up" strong={strong} />}
      </span>
    </span>
  );
}

function TermBar({ term }: { term: ValueTerm }) {
  const copy = TERM_COPY[term.label];

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-x-2">
      <span className="min-w-0">
        <span className="block truncate text-xs text-base-content/70">
          {copy?.label ?? term.label}
        </span>
        {/* Printed, not hovered. This used to be `title=` only, so on a phone
            the entire reason the panel exists was unreachable -- and this is a
            review screen people read on a phone. Small and quiet is the right
            weight for it; absent was not. */}
        {copy?.why && (
          <span className="block text-[0.6875rem] leading-snug text-base-content/45">
            {copy.why}
          </span>
        )}
      </span>

      <Track delta={term.delta} />

      <span className="text-right text-xs tabular-nums text-base-content/70">
        {points(term.delta)}
      </span>
    </li>
  );
}

/**
 * The sum, drawn on the same scale as the parts.
 *
 * This is what makes the panel's claim checkable rather than asserted. The
 * terms sum exactly to `total − base`, and now that a point of win rate is a
 * fixed number of pixels, that sum is a LENGTH -- so a reader can see the parts
 * add up to the whole instead of taking the docblock's word for it. It is the
 * row that was missing, not a decoration on the rows that were there.
 */
function NetBar({ net }: { net: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-x-2 border-t border-base-300 pt-1.5">
      <span className="truncate text-xs font-semibold">What your deck did to it</span>
      <Track delta={net} strong />
      <span className="text-right text-xs font-semibold tabular-nums">{points(net)}</span>
    </div>
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

  // The sum the panel has always claimed and never drawn. Summed from the terms
  // rather than taken as `total − base`, because that is the claim: if the two
  // ever disagree, the bars are wrong and should look wrong, not be quietly
  // corrected into agreeing with the header.
  const net = terms.reduce((sum, term) => sum + term.delta, 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-base-content/60">Its own win rate</span>
        <span className="tabular-nums text-base-content/70">{pct(base)}</span>
      </div>

      <ol className="flex flex-col gap-2">
        {terms.map((term) => (
          <TermBar key={term.label} term={term} />
        ))}
      </ol>

      <NetBar net={net} />

      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">What it was worth here</span>
        <span className="font-semibold tabular-nums">{pct(total)}</span>
      </div>

      {/* The scale, said once at the foot. It is the same on every breakdown in
          the app now, which is the property worth stating -- a reader who
          measures one bar has measured all of them, including the ones twenty
          picks further down the page. The torn-edge clause is only printed when
          there is a torn edge to explain. */}
      <p className="text-[0.625rem] leading-snug text-base-content/40">
        Full bar is {MAX_PP}pp, the same on every pick.
        {terms.some((t) => Math.abs(t.delta) * 100 > MAX_PP) &&
          " A torn end means the bar ran past it — read that one off the number."}
      </p>
    </div>
  );
}
