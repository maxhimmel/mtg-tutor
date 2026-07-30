// A pack is one object the player reads whole, not a feed they scroll, so it is
// shown only once every card in it can be drawn. Lazy loading meant fifteen
// images fading up out of empty frames in whatever order the network returned
// them, which is a worse first impression of a pack than a moment of waiting.
//
// decode() rather than onload, because a loaded image still costs a decode on
// first paint -- and that decode is the flash this exists to remove.

// A dead CDN must not trap the player behind a loading state forever. Past this
// the pack is shown regardless and the stragglers arrive as they arrive.
const CEILING_MS = 4000;

function preloadOne(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  const settled =
    typeof img.decode === "function"
      ? img.decode()
      : new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
        });
  // A card whose art fails to load still has a name and a frame to render, so a
  // failure resolves like a success -- it just stops being worth waiting for.
  return settled.then(
    () => undefined,
    () => undefined,
  );
}

export function preloadImages(urls: readonly string[]): Promise<void> {
  if (urls.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(urls.map(preloadOne)).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, CEILING_MS)),
  ]);
}
