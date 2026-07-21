import { HTTP } from "../config.js";
import { cached } from "./cache.js";
import type { ScryfallCard } from "@mtg-tutor/core";

export type { ScryfallCard, ScryfallFace } from "@mtg-tutor/core";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAllPages(setCode: string): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=set%3A${encodeURIComponent(setCode)}+is%3Abooster&unique=cards&order=set`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: { "User-Agent": HTTP.userAgent, Accept: "application/json" },
    });
    if (res.status === 404) return out; // no cards for this set
    if (!res.ok) throw new Error(`Scryfall ${res.status} for set ${setCode}`);
    const body = (await res.json()) as {
      data: ScryfallCard[];
      has_more: boolean;
      next_page: string | null;
    };
    out.push(...body.data);
    url = body.has_more ? body.next_page : null;
    if (url) await sleep(HTTP.scryfallDelayMs);
  }
  return out;
}

export function fetchSetCards(setCode: string): Promise<ScryfallCard[]> {
  return cached(`scryfall_${setCode.toLowerCase()}`, () =>
    fetchAllPages(setCode.toLowerCase()),
  );
}
