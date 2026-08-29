/**
 * The three things a chart says, and the one way to say nothing.
 *
 * AXIS, LEGEND AND TOOLTIP ARE NOT THREE FEATURES. They are one requirement --
 * can a reader who has never seen this chart work out what it says -- answered
 * at three distances:
 *
 *     across the room    the AXIS     what the scale is
 *     arm's length       the LEGEND   what the colours and shapes mean
 *     at the cursor      the TIP      what THIS mark is
 *
 * `guides` is the grammar-of-graphics word for exactly this set, and it is worth
 * borrowing rather than coining one: axes and legends are the same object seen
 * from different sides -- both map a visual channel back to the value it stands
 * for -- and a tooltip is that map read one datum at a time. Treating them as a
 * checklist is how you end up with a legend on the chart that needed an axis.
 *
 * "SIMPLY EXPLAINABLE" IS NOT A FOURTH GUIDE. It is the acceptance test for the
 * other three, and `Plot` already enforces it: `label` is the chart in one
 * sentence with its units and both ends of its scale, and a label you cannot
 * finish is a chart missing a rung.
 *
 * WHY OFF IS A SENTENCE AND NOT A BOOLEAN. Plenty of charts genuinely need less
 * than three, and this app has the best example already written down --
 * `WinRateAxis`: "Every value is labelled, which is why there is no legend and
 * no tooltip: there is nothing a hover could add." That is a real argument, and
 * `legend={false}` would have thrown it away. So the escape hatch takes the
 * reason instead of a flag. It is the same one line to write, it survives into
 * the next reader's head, and a `{ none: "" }` you cannot fill in is the tell
 * that the guide was needed after all.
 *
 * It is NOT a guard rail meant to slow anybody down. Turning a guide off stays a
 * one-liner, on purpose: these charts are going to meet cases nobody has
 * imagined yet, and a kit that makes the exception expensive gets worked around
 * rather than used.
 */

/** A guide, or a stated reason this chart does not need one. */
export type Guide<T> = T | Off;

export interface Off {
  /**
   * Why this chart says nothing at this distance. Written for the next person
   * to open the file, not for a linter.
   */
  none: string;
}

export function isOff<T>(guide: Guide<T> | undefined): guide is Off {
  return typeof guide === "object" && guide !== null && "none" in guide;
}

/** The guide itself, or undefined where the chart has argued its way out. */
export function given<T>(guide: Guide<T>): T | undefined {
  return isOff(guide) ? undefined : guide;
}

/**
 * What the axis claims, in words.
 *
 * A chart draws its own axis -- the marks and the scale are the caller's, and a
 * frame that drew them would have to know the shape. What `Plot` takes is the
 * DECLARATION, which is the half that kept going missing: three of the sixteen
 * defects in the August audit were a scale nobody had stated, and in two of
 * them the axis was drawn and simply had no numbers on it.
 *
 * Folded into the accessible name, so the sentence a screen reader gets and the
 * sentence the author had to write are the same sentence.
 */
export interface AxisSaid {
  /** e.g. "Percentage points behind the best card, 0 to 8." */
  domain: string;
  /** Where the reader is expected to measure from, if it is not zero. */
  from?: string;
}

/**
 * What a legend entry has to carry.
 *
 * The COUNT is part of it wherever there is one, which is the lesson from the
 * best legend already in the app: the challenge diff's pick split prints each
 * segment's count beside its swatch, so no value on the chart needs a hover and
 * the legend stops being a thing you consult and becomes a thing you read.
 *
 * `shape` is not decoration. It is the second channel, and for one palette in
 * this app it is mandatory -- see `manaMark` in `marks.tsx`.
 *
 * A LEGEND IS FOR TELLING TWO OR MORE SERIES APART. One series gets none: the
 * chart's own title names it, and its marks are direct-labelled instead. The
 * card-stats win-rate scale is the case that taught this -- a dot, a band and a
 * rule are not three series but three claims about one number, and named in a
 * key they cost four lines under a chart thirty-six pixels tall.
 */
export interface LegendSaid {
  label: string;
  ink: string;
  shape?: "bar" | "hollow" | "dot";
  aside?: string | number;
  means?: string;
}
