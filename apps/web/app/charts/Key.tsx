import type { ReactNode } from "react";

/**
 * What the colours on a chart mean, drawn from the same tokens the chart used.
 *
 * IT EXISTS BECAUSE THE LEGENDS IN THIS APP WERE IN THE WRONG PLACES. The audit
 * found keys on the two graphics that needed them least -- `PickMarksKey`, whose
 * marks already carry a text label beside every card, and `PickSplit`, which
 * prints every count in the legend itself -- and none at all on the review's
 * pick track, where hit and miss are green and red, six pixels tall, at the same
 * height, with no text anywhere on the page. That is the one place hue is
 * genuinely load-bearing and it was the one place with nothing explaining it.
 *
 * A COUNT IS PART OF THE KEY WHERE THERE IS ONE. `PickSplit` is the model worth
 * copying: printing each segment's count beside its swatch means no value on the
 * chart needs a hover, and it turns the legend from a thing you consult into a
 * thing you read. `aside` is that slot.
 *
 * COLOUR IS NEVER THE ONLY CHANNEL, and a key does not make it one. If two
 * states differ by hue alone, they need a second difference -- a height, a
 * shape, a fill against a hollow -- and the key should show that difference too,
 * which is why the swatch takes `shape` rather than only a colour.
 */

export interface KeyEntry {
  /** What this is called. The word the rest of the screen uses for it. */
  label: string;
  /** The paint. A role from `ink.ts`, never a literal colour. */
  ink: string;
  /**
   * Drawn instead of the colour chip, where the app already has a better mark
   * for this thing than a rectangle of its colour.
   *
   * The case that produced it is Magic's own: a colour is written as a PIP, on
   * every card in the pack and every placard in a deck list, and `ColorPips`
   * has argued since it was written that a reader who has seen one card knows
   * what the blue drop means. A chip is a mark that appears nowhere else in the
   * game, and for a gold card it is not even one colour. Handing the key the
   * symbol makes it the same object the reader is already fluent in -- and
   * carries a two-colour card without a gradient having to survive a swatch.
   */
  swatch?: ReactNode;
  /**
   * The second channel, so the entry is legible without the hue. `bar` is a
   * filled band, `hollow` is the same band unfilled, `dot` is a point estimate.
   */
  shape?: "bar" | "hollow" | "dot";
  /** The count, the share, the value. Printed so the chart needs no hover. */
  aside?: ReactNode;
  /** What it means, where the label alone is a code rather than a word. */
  means?: string;
}

/**
 * The colour chip, and the reason it paints with `background` and not
 * `backgroundColor`.
 *
 * `cardFrame` hands multicolour cards a GRADIENT -- `linear-gradient(to right,
 * …)` -- as their ring, because a gold card's ring runs through every colour it
 * is. `background-color` does not accept one: the declaration is thrown out and
 * the chip renders transparent, so every gold entry in a key was an invisible
 * swatch beside a label. Found by looking at the thing rather than at the code.
 * The shorthand takes a flat colour and a gradient alike, so one property serves
 * both and no caller has to know which kind of paint it is holding.
 */
function Swatch({ ink, shape = "bar" }: { ink: string; shape?: KeyEntry["shape"] }) {
  if (shape === "dot") {
    return (
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: ink }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="h-1.5 w-4 shrink-0 rounded-full"
      style={shape === "hollow" ? { border: `1px solid ${ink}` } : { background: ink }}
    />
  );
}

export function Key({ entries, className }: { entries: KeyEntry[]; className?: string }) {
  return (
    <dl className={`flex flex-wrap gap-x-5 gap-y-1.5 ${className ?? ""}`}>
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-start gap-1.5">
          {/* A box exactly one label-line tall, with the mark centred in it.
              Each swatch used to nudge itself down with a hand-tuned margin,
              which is a number that can only be right for one mark: a 6px bar
              and a mana pip have different intrinsic heights, so the margin that
              centred the bar sat the pip too high. Centring inside a box the
              size of the thing it has to line up with holds for any mark,
              including whatever a caller passes as `swatch`.

              `h-4` is `text-xs`'s own line box, which is what `dt` renders in.
              `items-start` on the row above, so an entry with a `means` line
              keeps its mark beside the LABEL rather than floating to the middle
              of two lines of text. */}
          <span className="flex h-4 shrink-0 items-center">
            {entry.swatch ?? <Swatch ink={entry.ink} shape={entry.shape} />}
          </span>
          <div className="min-w-0">
            <dt className="flex items-baseline gap-1.5 text-xs text-base-content/70">
              {entry.label}
              {entry.aside != null && (
                <span className="tabular-nums text-base-content/50">{entry.aside}</span>
              )}
            </dt>
            {entry.means && (
              <dd className="text-[0.6875rem] leading-snug text-base-content/45">
                {entry.means}
              </dd>
            )}
          </div>
        </div>
      ))}
    </dl>
  );
}
