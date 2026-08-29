"use client";

import type { MouseEvent } from "react";
import { scaleLinear } from "@visx/scale";
import type { ValueTerm } from "@mtg-tutor/core";
import { pct, points } from "../lib/format";
import { INK, MARK, NEUTRAL } from "../charts/ink";
import { Plot, ValueAxisBottom } from "../charts/Plot";
import { Key } from "../charts/Key";
import { ValueBar } from "../charts/marks";
import { useCursorTip, type CursorTip } from "./CursorTip";

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
// The whole diverging track, both arms. Fixed, and the reason it is fixed is
// the docblock above: a point of win rate is the same number of pixels on every
// breakdown in the app, so the scale cannot be measured off the box it lands in.
const SPAN = TRACK * 2;
const BAR_H = MARK.band;
const ROW_H = BAR_H + 2;

// The one scale, shared by every bar and by the axis under them. Built once at
// module scope rather than per row: forty of these on a scroll is forty
// identical d3 scales, and a scale rebuilt per row is a scale that can differ
// per row.
const x = scaleLinear({ domain: [-MAX_PP, MAX_PP], range: [0, SPAN] });
const ZERO = x(0);

// How deep the tear bites into the end of a clamped bar. The clip-path this
// replaces cut at 88% of the arm, which on a full 44px arm is a hair over five
// pixels -- kept, because it is the size at which the notch reads as torn
// rather than as a rounded cap somebody got wrong.
const TEAR = 5;

/**
 * One arm of a diverging bar, and the mark that says it ran out of track.
 *
 * A clamped bar and a bar that happens to reach the end are the same picture,
 * which is the failure this whole component was rebuilt to stop making. The
 * clamped one loses its rounded cap and gains a torn edge, so the two are told
 * apart at the one place a reader is already looking -- the tip.
 *
 * IT IS A MARK NOW AND NOT A CLIP-PATH, which is the change worth stating. The
 * torn end used to be a Tailwind `[clip-path:polygon(...)]` on a div -- a
 * silhouette cut out of a rectangle, whose geometry lived in percentages of
 * whatever width the arm happened to be and could not be drawn at all in the
 * kit the rest of these charts are built from. Drawn as a path in the same SVG
 * as the bar it belongs to, the notch is a fixed five pixels whatever the arm's
 * length, which is what a torn edge has to be: a tear is a property of the END
 * of the bar, not a fraction of it.
 *
 * `ValueBar` for the unclamped case rather than a second rectangle, because the
 * asymmetry it enforces is exactly this mark's claim -- square where it meets
 * the zero rule, capped where it stops. That is the kit's rule and it was
 * already being hand-rolled here as `rounded-r-sm`.
 */
function Arm({ pp, up, strong }: { pp: number; up: boolean; strong?: boolean }) {
  const over = pp > MAX_PP;
  const width = Math.min(pp, MAX_PP) * PX_PER_PP;
  const ink = up ? INK.up : INK.down;
  const opacity = strong ? 1 : 0.7;
  const y = (ROW_H - BAR_H) / 2;

  if (!over) {
    return (
      <g opacity={opacity}>
        <ValueBar
          x={up ? ZERO : ZERO - width}
          y={y}
          width={width}
          height={BAR_H}
          ink={ink}
          from={up ? "left" : "right"}
        />
      </g>
    );
  }

  const end = up ? ZERO + width : ZERO - width;
  const bite = up ? end - TEAR : end + TEAR;

  return (
    <path
      opacity={opacity}
      fill={ink}
      d={`M ${ZERO} ${y} L ${end} ${y} L ${bite} ${y + BAR_H / 2} L ${end} ${y + BAR_H} L ${ZERO} ${y + BAR_H} Z`}
    />
  );
}

/**
 * One row's bar, on the scale every other row is drawn on.
 *
 * Two equal halves so zero is the same x on every row, whatever the widest term
 * happens to be. Bars grow OUT from that rule, so length is magnitude and side
 * is sign, and neither has to be read off the other.
 *
 * The zero rule is drawn per row and labelled ONCE, on the axis at the foot.
 * Labelling it forty times down a scroll is the same fact forty times; leaving
 * it unlabelled entirely is the failure `Reference` exists to stop. The axis
 * under the list is where the domain is stated, and it is drawn on this same
 * `x`, in a box this same `SPAN` wide, so a tick and a bar end at the same
 * value land on the same pixel.
 */
function Track({ delta, strong }: { delta: number; strong?: boolean }) {
  const pp = Math.abs(delta) * 100;

  return (
    <svg width={SPAN} height={ROW_H} aria-hidden className="shrink-0 overflow-visible">
      <line x1={ZERO} x2={ZERO} y1={0} y2={ROW_H} stroke={INK.zero} strokeWidth={MARK.axis} />
      {pp > 0 && <Arm pp={pp} up={delta > 0} strong={strong} />}
    </svg>
  );
}

/** The grid every row, and the axis under them, is set in. */
const ROW = "grid grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-x-2";

/**
 * What a row says to a pointer, which is the one thing this panel draws and
 * cannot print.
 *
 * Every value here is already on the row in figures, so a readout repeating it
 * would be the same fact twice -- the footing `ManaCurve` set for a hover and
 * the reason most rows here say only a longer form of what is printed. The
 * exception is the clamped one: a torn bar is deliberately NOT claiming a
 * magnitude, so its own length is unreadable by construction, and the sentence
 * that says how far past the end it went has nowhere else to go.
 */
const sayTerm = (term: ValueTerm, label: string): string => {
  const pp = Math.abs(term.delta) * 100;
  const way = term.delta > 0 ? "added to" : "taken off";
  const sentence = `${label}: ${points(term.delta)} ${way} its own win rate.`;
  return pp > MAX_PP
    ? `${sentence} The bar is torn because it runs past the ${MAX_PP}pp end of the track — it is not drawn to length.`
    : sentence;
};

function TermBar({
  term,
  follow,
}: {
  term: ValueTerm;
  follow: CursorTip["follow"];
}) {
  const copy = TERM_COPY[term.label];
  const label = copy?.label ?? term.label;

  return (
    <li className={ROW} {...follow(() => sayTerm(term, label))}>
      <span className="min-w-0">
        <span className="block truncate text-xs text-base-content/70">{label}</span>
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
    <div className={`${ROW} border-t border-base-300 pt-1.5`}>
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
  // Above the two early returns, because a hook is not allowed to be conditional
  // -- and both of those branches are prose with nothing to point at anyway.
  const tip = useCursorTip();

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
  const anyTorn = terms.some((t) => Math.abs(t.delta) * 100 > MAX_PP);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-base-content/60">Its own win rate</span>
        <span className="tabular-nums text-base-content/70">{pct(base)}</span>
      </div>

      <ol className="flex flex-col gap-2">
        {terms.map((term) => (
          <TermBar key={term.label} term={term} follow={tip.follow} />
        ))}
      </ol>

      <NetBar net={net} />

      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">What it was worth here</span>
        <span className="font-semibold tabular-nums">{pct(total)}</span>
      </div>

      {/* THE SCALE, DRAWN AND NOT ONLY ASSERTED. This was one line of prose --
          "full bar is 8pp, the same on every pick" -- which is a true statement
          of a domain and not a statement a reader can measure anything against.
          The bars had no axis at all: no zero label, no ends, nothing marking
          where four points is. Said once, at the foot, because it IS the same
          on every row and the rows are what the panel is for.

          Set in the row grid with the axis in the middle column, so it is drawn
          in the same box the bars are and every tick lands on the pixel the
          bars measure it at. */}
      <div className={ROW}>
        <span />
        <div style={{ width: SPAN }}>
          <Plot
            height={18}
            needs={SPAN}
            // A fixed-width mark in a fixed-width column: it fits by
            // construction, and the sentence is what a reader gets if that ever
            // stops being true rather than a silently squeezed scale.
            instead={
              <span className="text-[0.625rem] text-base-content/40">
                ±{MAX_PP}pp, zero in the middle.
              </span>
            }
            label={`Points of win rate each term added or took off, from ${MAX_PP} points against on the left to ${MAX_PP} points for on the right, zero in the middle. The same scale on every pick.`}
            legend={{
              none: "Drawn full width under the axis instead: this box is eighty-eight pixels wide, which is the width of the bars and not a width three entries and their swatches can be read in.",
            }}
            tip={tip.node}
          >
            {(box) => (
              <ValueAxisBottom
                scale={scaleLinear({ domain: [-MAX_PP, MAX_PP], range: [0, box.width] })}
                top={0}
                numTicks={5}
                format={(v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0")}
              />
            )}
          </Plot>
        </div>
        <span />
      </div>

      {/* WHAT THE TWO COLOURS ARE, which the panel never said. Green and red
          here are the grade scale's own pair and they mean what a grade means --
          this helped you, this cost you -- but sign is carried typographically
          as well, by the + and − `points` emits into every figure on the right
          of every row. So the key names the hues rather than being the only
          thing separating them. The torn entry appears only where there is a
          torn bar to explain. */}
      <Key
        entries={[
          { label: "helped", ink: INK.up, shape: "bar", means: "right of the rule" },
          { label: "cost you", ink: INK.down, shape: "bar", means: "left of the rule" },
          ...(anyTorn
            ? [
                {
                  label: "ran past the end",
                  ink: NEUTRAL.quiet,
                  swatch: (
                    <svg width={16} height={6} aria-hidden>
                      <path
                        d={`M 0 0 L 16 0 L ${16 - TEAR} 3 L 16 6 L 0 6 Z`}
                        fill={NEUTRAL.quiet}
                      />
                    </svg>
                  ),
                  means: `over ${MAX_PP}pp — read that one off the number`,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
