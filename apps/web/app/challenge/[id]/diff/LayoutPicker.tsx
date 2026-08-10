"use client";

import { DIFF_LAYOUTS, useSettings } from "../../../lib/useSettings";

/**
 * Which shape the page is in, as a control on the page itself.
 *
 * It is here rather than behind the avatar for the reason the account menu
 * taught: the settings that lived there were changed by almost nobody, and a
 * control nobody finds and a control nobody wants produce the same silence. This
 * one is being asked a question -- which of four readings of this comparison a
 * person keeps -- and a question asked from two menus deep is not asked.
 *
 * The four names are nouns rather than descriptions, because the four things
 * they name are on screen the instant you press them. "Braid pinned left,
 * summary in flow" is a caption for a layout you cannot see, and it is longer
 * than the layout takes to look at.
 *
 * Gold for the one that is on, which is what gold means everywhere else in this
 * app -- the card you are holding, the tick you are on, the sort the fork list
 * is in.
 */
export function LayoutPicker() {
  const { settings, update } = useSettings();

  return (
    <span className="flex items-center gap-2">
      <span className="eyebrow hidden lg:inline">Layout</span>
      <span className="join" role="group" aria-label="How this comparison is laid out">
        {DIFF_LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            className={`btn btn-xs join-item border-base-300 font-normal ${
              settings.diffLayout === layout.id ? "btn-primary" : "btn-ghost"
            }`}
            aria-pressed={settings.diffLayout === layout.id}
            title={layout.blurb}
            onClick={() => update({ diffLayout: layout.id }, "diff")}
          >
            {layout.label}
          </button>
        ))}
      </span>
    </span>
  );
}
