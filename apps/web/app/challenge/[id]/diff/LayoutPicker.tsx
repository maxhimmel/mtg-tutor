"use client";

import { DIFF_LAYOUTS, useSettings } from "../../../lib/useSettings";

/**
 * Which shape the comparison is in, as a control on the comparison itself.
 *
 * It is here rather than behind the avatar for the reason the account menu
 * taught: the settings that lived there were changed by almost nobody, and a
 * control nobody finds and a control nobody wants produce the same silence.
 *
 * THE APP ALREADY HAS THIS CONTROL, and this is it rather than something like
 * it. Two mutually exclusive readings of one object is exactly what `ReviewViews`
 * is -- the three ways of reading a finished draft -- so the trough, the radius,
 * the type size and the gold fill all come from there. The first version of this
 * was a row of `btn-xs` in a `join` with the word "Layout" in front of it, which
 * was right for what it was at the time: scaffolding, on screen for an afternoon,
 * to be thrown out with the layouts that lost. It is permanent now, and a
 * permanent control that is the app's own idea drawn slightly differently is
 * worse than either doing it the same or doing it deliberately differently.
 *
 * NO LABEL, for the same reason `ReviewViews` has none. A segmented control with
 * one segment lit is self-describing once, and after that the word in front of it
 * is a word you read every visit to learn nothing. What it is called survives
 * where it is needed, on the group itself, for a reader who cannot see which of
 * the two is filled.
 *
 * BUTTONS AND `aria-pressed`, WHERE THE REVIEW'S ARE LINKS AND `aria-current`.
 * That difference is real and not worth hiding: those three are pages and this is
 * a preference, so there is nothing to navigate to. Not a `radiogroup`, which is
 * the other honest option -- that contract owes a reader one tab stop and arrow
 * keys between the options, and building that for two buttons buys a keyboard
 * reader one saved keystroke in exchange for a control that no longer behaves
 * like every other button on the page.
 */
export function LayoutPicker() {
  const { settings, update } = useSettings();

  return (
    <div
      className="flex rounded-lg bg-base-300 p-0.5"
      role="group"
      aria-label="How this comparison is laid out"
    >
      {DIFF_LAYOUTS.map((layout) => {
        const here = settings.diffLayout === layout.id;
        return (
          <button
            key={layout.id}
            type="button"
            aria-pressed={here}
            // What each one does, for a pointer that hovers before committing.
            // The labels are two nouns, and a noun cannot say where the score
            // ends up -- but a reader can also just press it and look, which is
            // why this is a title and not a line of type under the control.
            title={layout.blurb}
            // `cursor-pointer` because this is a BUTTON and the control it is
            // copied from is made of LINKS. A browser gives an anchor the hand
            // for free and a button the arrow, and daisyUI's `.btn` is what
            // usually papers over that -- so dropping `btn` for the segmented
            // control's own classes silently took the cursor with it. Anything
            // on this page that is pressable and is not a `.btn` has to say so.
            className={`cursor-pointer rounded-md px-3 py-1 text-sm transition-colors ${
              here
                ? "bg-primary font-semibold text-primary-content"
                : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
            }`}
            onClick={() => update({ diffLayout: layout.id }, "diff")}
          >
            {layout.label}
          </button>
        );
      })}
    </div>
  );
}
