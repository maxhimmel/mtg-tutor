// Scryfall publishes every card image twice: a JPG, and a WebP of byte-for-byte
// identical pixel dimensions that is 22-41% smaller. `normal` and `grid` are the
// same 488x680 picture at 88KB and 55KB.
//
// Ingest stores the JPG URL (mapping.ts reads image_uris.normal), and the two
// differ only by path segment and extension, so rewriting here buys the saving
// on every set already in the database -- no re-crawl, no POOL_REVISION bump,
// and it reverts by deleting one call.
const WEBP_TWIN: Record<string, string> = {
  small: "thumb",
  normal: "grid",
  large: "display",
  art_crop: "art",
  border_crop: "crop",
};

const SCRYFALL_JPG =
  /(cards\.scryfall\.io\/)(small|normal|large|art_crop|border_crop)(\/[^?]+)\.jpg/;

/** Any URL that is not a Scryfall JPG in a known size passes through unchanged. */
export function webpImage(url: string): string;
export function webpImage(url: undefined): undefined;
export function webpImage(url?: string): string | undefined;
export function webpImage(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(
    SCRYFALL_JPG,
    (_whole, host: string, variant: string, rest: string) =>
      `${host}${WEBP_TWIN[variant]}${rest}.webp`,
  );
}
