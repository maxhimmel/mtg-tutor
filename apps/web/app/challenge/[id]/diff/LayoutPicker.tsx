"use client";

import { Segmented } from "../../../components/Segmented";
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
 * That argument came for this file in the end. The markup it used to hold now
 * lives in `Segmented`, together with the reasons for the label, the cursor and
 * `aria-pressed` over a `radiogroup` -- because a third copy was about to be
 * written for the settings page, and three is where a shape stops being a
 * coincidence. What is left here is which setting it sets and where from.
 */
export function LayoutPicker() {
  const { settings, update } = useSettings();

  return (
    <Segmented
      label="How this comparison is laid out"
      options={DIFF_LAYOUTS}
      value={settings.diffLayout}
      onChange={(id) => update({ diffLayout: id }, "diff")}
    />
  );
}
