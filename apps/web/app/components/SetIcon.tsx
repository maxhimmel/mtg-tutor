"use client";

// Scryfall's set icons are solid-black SVGs with no palette of their own, so an
// <img> of one is a black smudge on the dark theme. Masking a currentColor
// block with the SVG instead makes the icon inherit whatever text colour it
// sits in, which is legible under both themes and lets callers tint it by
// setting a text colour like any other glyph.
export function SetIcon({
  uri,
  name,
  className = "size-5",
  onAnimationIteration,
}: {
  uri?: string;
  name?: string;
  className?: string;
  // For a caller that animates the icon and needs to know when a pass of that
  // animation has finished -- the draft board holds its loading state until the
  // sheen has crossed the symbol once. The browser's own event rather than a
  // matching timer, so there is no duration written down in two places.
  onAnimationIteration?: () => void;
}) {
  if (!uri) return null;

  return (
    <span
      role="img"
      aria-label={name ? `${name} set icon` : undefined}
      aria-hidden={name ? undefined : true}
      className={`inline-block shrink-0 bg-current ${className}`}
      onAnimationIteration={onAnimationIteration}
      style={{
        maskImage: `url("${uri}")`,
        WebkitMaskImage: `url("${uri}")`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
