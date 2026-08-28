/**
 * What a chart in this app is allowed to paint with, as named roles.
 *
 * THERE IS NO FREE CATEGORICAL PALETTE HERE, and that is the whole reason this
 * file exists rather than a list of five nice hues. Every colour in the theme is
 * already spoken for:
 *
 * - `success` / `info` / `warning` / `error` ARE THE GRADE SCALE. `globals.css`
 *   picks them by hue spacing for exactly that job and `gradeColor` in
 *   lib/format maps A+/A -> success, B+/B -> info, C+/C -> warning, D/F ->
 *   error. A chart that reaches for green because it wanted a second series is
 *   making a claim about a grade whether it meant to or not.
 * - `primary` -- the gold -- MEANS "YOURS", or "the live one". It is the card
 *   under the cursor, the pick you made, the deck you built, the tick you are
 *   standing on. Spending it on an arbitrary series makes every other gold on
 *   the screen mean less.
 * - The five Magic colours are `lib/cardFrame`, deliberately literal hex,
 *   because they say which colour a CARD is and must not move when the UI
 *   theme does.
 *
 * What is left for "a series with no meaning of its own" is base-content at a
 * stated opacity, and that is genuinely enough: no chart in this app has ever
 * needed more than three unnamed series, and the two that came close were
 * better off drawn as one series against a reference line.
 *
 * SO THE EXPORT IS ROLES, NOT COLOURS. Asking for `INK.yours` says what the
 * mark means and gets the gold; there is no way to ask for "the third colour",
 * which is the request that produces a chart nobody can read. If a new mark
 * needs a colour, it needs a role here first -- and the argument for the role is
 * the argument for the colour.
 */

/** A paint value, always a `var()` so a theme change moves it without JS. */
export type Ink = string;

const token = (name: string): Ink => `var(--color-${name})`;

/**
 * Base-content at a fraction, for marks whose colour carries no meaning.
 *
 * The steps are named rather than free because the audit found `/25` and `/30`
 * text all over this app sitting near 2:1 against a 19%-lightness ground -- fine
 * for a hairline, not for a digit. `quiet` is the floor for anything a reader
 * has to READ; anything below it is structure.
 */
export const NEUTRAL = {
  /** A value, a label, a tick number. The floor for legible text. */
  plain: "color-mix(in oklab, var(--color-base-content) 78%, transparent)",
  /** A secondary value: present, deliberately second. */
  quiet: "color-mix(in oklab, var(--color-base-content) 55%, transparent)",
  /** An axis line, a gridline, a band a mark sits on. Not for text. */
  rule: "color-mix(in oklab, var(--color-base-content) 22%, transparent)",
  /** The unfilled half of a proportion -- a hollow waffle dot, an empty bar. */
  hollow: "color-mix(in oklab, var(--color-base-content) 30%, transparent)",
} as const;

export const INK = {
  /**
   * You: your pick, your deck, your score. The one saturated colour in the
   * chrome, and the reason a chart should rarely have two of anything.
   */
  yours: token("primary"),
  /** The other party in a comparison -- the field, the bots, the opponent. */
  theirs: NEUTRAL.plain,

  /**
   * The zero a diverging value is measured from, and the axis it sits on.
   *
   * Louder than a gridline on purpose. On a chart where every mark lands near
   * zero, the zero rule is the only thing on screen carrying the answer -- see
   * the archetype quiz, where this was a one-pixel tick at 25% and a screenshot
   * made the case against it better than an argument could.
   */
  zero: "color-mix(in oklab, var(--color-base-content) 45%, transparent)",
  rule: NEUTRAL.rule,
  hollow: NEUTRAL.hollow,
  label: NEUTRAL.quiet,
  value: NEUTRAL.plain,

  /**
   * Better and worse, for a signed quantity ONLY.
   *
   * These are the grade scale's own green and red, which is correct here --
   * "this helped you" and "this cost you" is the same claim a grade makes -- and
   * wrong for anything else. Sign must also be carried typographically (`points`
   * emits a + or a −) so the hue is never the only thing saying it.
   */
  up: token("success"),
  down: token("error"),
} as const;

/**
 * The width of a mark's band, in the one place both halves of a pair can read
 * it. A dot and the band under it disagreeing about their sizes is the class of
 * bug that makes a chart look hand-drawn.
 */
export const MARK = {
  /** A point estimate. Big enough to aim at, small enough not to be a blob. */
  dot: 8,
  /** The band under a dot: an interval, a margin, a range. */
  band: 6,
  /** A rule the eye is meant to measure from. */
  axis: 1,
} as const;
