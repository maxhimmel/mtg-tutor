"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { type Card, normalizeName } from "@mtg-tutor/core";
import { env } from "../env";
import { PageHeading } from "../components/PageHeading";
import { PageShell } from "../components/PageShell";
import { Panel } from "../components/Panel";
import { SPECIMENS } from "./Specimens";

// Real cards, out of the real database, and not a fixture file. A fixture is a
// snapshot of what somebody believed a card looked like on the day they wrote
// it, and the bugs this stage is for -- a ten-pip cost, a name with a comma in
// it, a two-in-one card whose type line carries a `//` -- live precisely in the
// gap between that belief and what ingest actually stored.
//
// It reads `sets.get`, which is documented over in convex/sets.ts as the fat
// query the app must never call: the whole pool plus every card's text, a few
// hundred KB a set. That warning is about the app, and this is not the app --
// it is one person, on one machine, opening one set on purpose, on a route that
// 404s in production. Nothing else here may follow it.
//
// The state that says what you are looking at lives in the URL rather than in
// React, so a case you have set up survives the reload that editing a component
// causes, and so it can be pasted into a message: ?set=fdn:PremierDraft&cards=Progenitus
const SEP = "|";

interface SetKey {
  code: string;
  format: string;
}

const keyOf = (set: SetKey) => `${set.code}:${set.format}`;

function parseKey(raw: string | null): SetKey | null {
  if (!raw) return null;
  const [code, format] = raw.split(":");
  return code ? { code, format: format || "PremierDraft" } : null;
}

// Long enough that a cold local backend answering slowly is not accused of
// being down, short enough to beat somebody's own guess at what is wrong.
const STALL_MS = 4000;

function useStalled(waiting: boolean): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!waiting) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  return stalled;
}

export function Playground() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const sets = useQuery(api.sets.list, {});
  // A query that never resolves and a set with no cards look identical from
  // here: an empty dropdown and a search box that finds nothing. Convex retries
  // a dead socket forever without surfacing anything, so the first time this
  // page was opened against a stack whose backend was not running, the screen
  // said nothing at all and the guess was that the playground was broken.
  const stalled = useStalled(sets === undefined);
  // Whichever set is newest, so opening the page bare still shows something.
  // Every set is one dropdown away, and the URL wins over both.
  const chosen: SetKey | null =
    parseKey(params.get("set")) ??
    (sets?.[0] ? { code: sets[0].code, format: sets[0].format } : null);

  const loaded = useQuery(
    api.sets.get,
    chosen ? { setCode: chosen.code, format: chosen.format } : "skip",
  );
  const cards: Card[] = useMemo(() => loaded?.cards ?? [], [loaded]);

  const write = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const names = (params.get("cards") ?? "").split(SEP).filter(Boolean);
  const byName = useMemo(
    () => new Map(cards.map((card) => [normalizeName(card.name), card])),
    [cards],
  );
  // Names that no longer resolve are dropped rather than reported: switching set
  // strands whatever the last one held, and that is the expected way to use the
  // dropdown, not a failure.
  const staged = names
    .map((name) => byName.get(normalizeName(name)))
    .filter((card): card is Card => card != null);

  const subject = staged.find((card) => card.name === focused) ?? staged.at(-1);

  const matches = useMemo(() => {
    const needle = normalizeName(query);
    if (needle.length < 2) return [];
    return cards
      .filter((card) => normalizeName(card.name).includes(needle))
      // A prefix hit is what somebody typing a name means; a substring hit is
      // the consolation prize.
      .sort((a, b) => {
        const lead = (card: Card) => (normalizeName(card.name).startsWith(needle) ? 0 : 1);
        return lead(a) - lead(b) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [cards, query]);

  const stage = (card: Card) => {
    if (!names.some((name) => normalizeName(name) === normalizeName(card.name))) {
      write({ cards: [...names, card.name].join(SEP) });
    }
    setFocused(card.name);
    setQuery("");
  };

  const unstage = (card: Card) => {
    write({
      cards:
        names.filter((name) => normalizeName(name) !== normalizeName(card.name)).join(SEP) || null,
    });
  };

  return (
    <PageShell>
      <PageHeading
        title={
          <>
            Component playground{" "}
            <span className="text-base-content/40">· dev only</span>
          </>
        }
        controls={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-base-content/60">Set</span>
            <select
              className="select select-sm select-bordered"
              value={chosen ? keyOf(chosen) : ""}
              onChange={(e) => write({ set: e.target.value, cards: null })}
            >
              {(sets ?? []).map((option) => (
                <option key={keyOf(option)} value={keyOf(option)}>
                  {option.name ?? option.code.toUpperCase()} · {option.format}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="flex flex-col gap-2 border-b border-base-300 pb-3">
          <div className="relative max-w-md">
            <input
              className="input input-sm input-bordered w-full"
              placeholder={
                loaded ? `Search ${cards.length} cards…` : "Loading the set…"
              }
              value={query}
              disabled={!loaded}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) stage(matches[0]);
                if (e.key === "Escape") setQuery("");
              }}
            />
            {matches.length > 0 && (
              <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-lg">
                {matches.map((card) => (
                  <li key={card.name}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-base-300"
                      onClick={() => stage(card)}
                    >
                      <span className="truncate">{card.name}</span>
                      <span className="shrink-0 text-xs text-base-content/50">
                        {card.rarity ?? "—"} · {card.manaCost || "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {staged.length > 0 && (
            <ul className="flex flex-wrap items-center gap-1.5">
              {staged.map((card) => (
                <li key={card.name}>
                  <span
                    className={`flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs ${
                      card.name === subject?.name
                        ? "border-primary bg-primary/10"
                        : "border-base-300 bg-base-200"
                    }`}
                  >
                    {/* Which card the one-card specimens below are drawing. */}
                    <button
                      type="button"
                      className="cursor-pointer"
                      onClick={() => setFocused(card.name)}
                    >
                      {card.name}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-full px-1 text-base-content/50 hover:bg-base-300 hover:text-base-content"
                      aria-label={`Take ${card.name} off the stage`}
                      onClick={() => unstage(card)}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageHeading>

      {stalled ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold">Convex has not answered.</p>
          <p className="mt-1 text-base-content/70">
            Nothing has come back from <code>{env.NEXT_PUBLIC_CONVEX_URL}</code>, which is
            almost always the local backend not running. Start it in the main checkout and
            this page picks up on its own:
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-base-300 px-3 py-2 text-xs">
            pnpm --filter @mtg-tutor/backend dev
          </pre>
        </div>
      ) : subject == null ? (
        <p className="text-base-content/60">
          Search a card to put it on the stage. Everything below is the app&apos;s own
          components, drawn with the card you picked — hover works, so does the preview.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {SPECIMENS.map((specimen) => (
            <Panel
              key={specimen.id}
              title={specimen.title}
              aside={<span className="text-xs text-base-content/50">{specimen.note}</span>}
            >
              {specimen.render({
                card: subject,
                cards: staged,
                selected: selected === subject.name,
                onSelect: () =>
                  setSelected((was) => (was === subject.name ? null : subject.name)),
              })}
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  );
}
