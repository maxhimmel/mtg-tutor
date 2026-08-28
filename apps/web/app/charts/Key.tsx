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
   * The second channel, so the entry is legible without the hue. `bar` is a
   * filled band, `hollow` is the same band unfilled, `dot` is a point estimate.
   */
  shape?: "bar" | "hollow" | "dot";
  /** The count, the share, the value. Printed so the chart needs no hover. */
  aside?: ReactNode;
  /** What it means, where the label alone is a code rather than a word. */
  means?: string;
}

function Swatch({ ink, shape = "bar" }: { ink: string; shape?: KeyEntry["shape"] }) {
  if (shape === "dot") {
    return (
      <span
        aria-hidden
        className="mt-[0.3rem] size-2 shrink-0 rounded-full"
        style={{ backgroundColor: ink }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="mt-[0.45rem] h-1.5 w-4 shrink-0 rounded-full"
      style={
        shape === "hollow"
          ? { border: `1px solid ${ink}` }
          : { backgroundColor: ink }
      }
    />
  );
}

export function Key({ entries, className }: { entries: KeyEntry[]; className?: string }) {
  return (
    <dl className={`flex flex-wrap gap-x-5 gap-y-1.5 ${className ?? ""}`}>
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-start gap-1.5">
          <Swatch ink={entry.ink} shape={entry.shape} />
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
