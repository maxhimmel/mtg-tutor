import { cardTypes } from "./typeLine.js";

/**
 * Whether the front of this card is printed sideways.
 *
 * Two shapes in the sets we hold, and 64 cards between them: every `split` card
 * -- Duskmourn's 23 Rooms and Murders at Karlov Manor's 5 ordinary splits, which
 * are all printed with both halves rotated -- and March of the Machine's 36
 * Battles. Nothing else, and no card in the pool has a sideways BACK, which is
 * why this asks about one face rather than returning a pair.
 *
 * A BATTLE IS NOT A LAYOUT. It is `transform`, exactly like every ordinary
 * double-faced card, and the back really is upright -- Invasion of Zendikar's
 * second face is a plain portrait Elemental. So the front type is what has to be
 * read; keying on the layout would rotate every werewolf in the pool.
 *
 * NEITHER IS IT A CHOICE OF IMAGE, which is the thing worth writing down because
 * it looks like one. Scryfall serves a Battle's front face and a split card's
 * whole card as 488x680 PORTRAIT files with the card lying on its side inside
 * them; a Room's `card_faces` carry no `image_uris` at all, so there is not even
 * a second URL to prefer. Verified against the live API before this was written.
 * The only fix available is to turn the picture, and it belongs on the client
 * because the stored data is already right.
 */
export function frontIsSideways(card: { layout?: string; typeLine: string }): boolean {
  return card.layout === "split" || cardTypes(card).includes("Battle");
}
