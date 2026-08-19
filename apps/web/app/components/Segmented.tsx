"use client";

/**
 * One choice out of a few, with the current one lit.
 *
 * THE APP ALREADY HAD THIS CONTROL THREE TIMES, drawn from the same trough,
 * radius and gold fill each time and diverging in the details that are hardest
 * to notice and easiest to get wrong -- `LayoutPicker` and the coach threshold's
 * panel were byte-identical but for type size, and the argument in
 * `LayoutPicker`'s own header ("a permanent control that is the app's own idea
 * drawn slightly differently is worse than either doing it the same or doing it
 * deliberately differently") applies to itself. The settings page would have
 * made it four. This is the one.
 *
 * WHAT IT CARRIES FORWARD from the version it was lifted out of, because each is
 * load-bearing rather than styling:
 *
 * `cursor-pointer`, because these are BUTTONS and the control this descends from
 * is made of LINKS. A browser gives an anchor the hand for free and a button the
 * arrow, and daisyUI's `.btn` is what usually papers over that -- so a segmented
 * control written without `btn` silently loses the cursor.
 *
 * `role="group"` with `aria-pressed`, not a `radiogroup`. That contract owes a
 * reader one tab stop and arrow keys between options, and building it here buys
 * a keyboard reader one saved keystroke in exchange for a control that no longer
 * behaves like every other button on the page.
 *
 * The blurb as `title`, so a pointer can hover before committing, and repeated
 * as visible type only where the caller asks for it. On a toolbar there is no
 * room and pressing it is faster than reading about it; on a settings page there
 * is nothing to press it against and the line under the group is the only thing
 * that says what the choice means.
 *
 * NO LABEL RENDERED. A segmented control with one segment lit is self-describing
 * once, and after that a word in front of it is a word read every visit to learn
 * nothing. `label` survives where it is needed -- on the group, for a reader who
 * cannot see which segment is filled.
 */
export function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  size = "sm",
  fill = false,
}: {
  options: readonly { id: T; label: string; blurb?: string }[];
  value: T;
  onChange: (id: T) => void;
  /** Names the group for a screen reader. Never drawn. */
  label: string;
  size?: "sm" | "xs";
  /** Segments share the width equally, for a group set inside a fixed panel. */
  fill?: boolean;
}) {
  return (
    <div
      // `w-fit`, because the trough must hug its segments and nothing else.
      // As a plain flex child this stretched to the width of whatever sat
      // beside or beneath it -- on the settings page, the line of explanatory
      // type under the group -- and since the segments themselves do not grow,
      // the surplus came out as bare trough trailing off the last one. It read
      // as a segment that had lost its label.
      //
      // `fill` is the deliberate opposite and keeps its stretch: inside a fixed
      // popover the group SHOULD span, and there the segments grow to fill it
      // so no trough is left over.
      className={`flex rounded-lg bg-base-300 p-0.5 ${fill ? "" : "w-fit"}`}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const here = value === option.id;
        return (
          <button
            key={String(option.id)}
            type="button"
            aria-pressed={here}
            title={option.blurb}
            className={`cursor-pointer rounded-md transition-colors ${
              // Both sizes carry their own horizontal padding. `xs` used to
              // carry none, which worked only because its one caller passed
              // `fill` and `flex-1` gave the segments a width -- so the size
              // was quietly not usable on its own, and the settings page is
              // where that would have shown up as nine numbers touching.
              size === "xs" ? "px-2 py-1 text-xs tabular-nums" : "px-3 py-1 text-sm"
            } ${fill ? "flex-1" : ""} ${
              here
                ? "bg-primary font-semibold text-primary-content"
                : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
            }`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The blurb of whichever segment is lit, under the group that lit it.
 *
 * Split out rather than folded into `Segmented`, because whether it is drawn is
 * a decision about the SURFACE and not about the control: a toolbar popover has
 * no room for it and a settings page is nothing but room. Height is reserved so
 * choosing does not shift the page under the cursor that is choosing.
 */
export function SegmentedBlurb<T extends string | number | boolean>({
  options,
  value,
}: {
  options: readonly { id: T; label: string; blurb?: string }[];
  value: T;
}) {
  return (
    // Capped at a reading measure rather than left to the column. Uncapped it
    // set the width of everything above it, which is how the group came to
    // stretch in the first place -- and a single line of small type running the
    // full width of a page is hard to read besides.
    <p className="min-h-[2.5rem] max-w-[34rem] text-xs leading-relaxed text-base-content/50">
      {options.find((option) => option.id === value)?.blurb}
    </p>
  );
}
