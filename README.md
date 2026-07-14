# mtg-tutor

An interactive CLI that helps you get better at drafting Magic: The Gathering. Simulate a full 8-person, 3-pack draft against bots, get every pick **scored and explained** against real-world [17Lands](https://www.17lands.com/) win-rate data, and track your progress over time.

## Why

Reading pick guides is passive. Improvement comes from **reps with objective feedback**. `mtg-tutor` gives you the reps (a full 45-pick draft), the objective feedback (each pick scored 0–100 vs the statistically best card still in the pack), the reasoning (why the better card was better — removal, win-rate gap, whether it wheels), and the long-term view (are your early picks strong but your late picks sloppy? do you commit to colors too slowly?).

## How it works

- **Ground truth = 17Lands.** Card quality comes from `ever_drawn_win_rate` (GIH WR) and `avg_seen` (ALSA), pulled live per set. Cards without enough data fall back to a rarity-based baseline.
- **Card pool = Scryfall.** The set's cards, types, mana costs, and rarities come from Scryfall; packs are generated from the rarity pools (1 rare/mythic, 3 uncommons, 11 commons per 15-card pack).
- **Bots draft against you.** Each of the 7 bots commits to colors as it picks, so signals flow and packs wheel realistically.
- **Everything is cached** under `~/.mtg-tutor/cache/` (24h TTL); stats are saved to a SQLite DB at `~/.mtg-tutor/stats.db`.

## Install

```bash
npm install
```

Requires Node 20+.

## Usage

Each capability is a **service** you run by name with `npm run <service>`:

```bash
# Draft a set (set code, e.g. dsk, blb, otj, fdn)
npm run draft dsk

# Specify a format (defaults to PremierDraft)
npm run draft dsk PremierDraft

# See your progress, trends, and biggest recurring mistakes
npm run stats
```

The unified `mtg-tutor` CLI dispatches to the same services (`npm run dev -- draft dsk`, or the built binary below).

After building (`npm run build`), the `mtg-tutor` binary works directly:

```bash
mtg-tutor draft dsk
mtg-tutor stats
```

During a draft, arrow-key through the pack (cards are pre-sorted by win rate with hints), press Enter to pick, and read the grade + reasoning after each pick. At the end you get an overall score, best-pick accuracy, a suggested 40-card deck, and your biggest missed picks — then choose whether to save the draft.

> **Note on set coverage:** scoring quality depends on how much 17Lands Premier Draft data a set has. Recent, heavily-played sets score best. If a set has little data, the CLI warns you and leans on rarity fallbacks.

## Development

```bash
npm test              # run the unit suite (vitest)
npm run verify-data   # sanity-check the live 17Lands + Scryfall response shapes
npx tsx scripts/smoke-draft.ts fdn   # headless full-draft smoke test
```

## Architecture

Code is split into a shared **`core/`** layer and independently runnable **`services/`**. A service owns its own flow and UI and depends on `core/`; `core/` never depends on a service.

```
src/
  cli.ts                       thin dispatcher -> services/*/run() (feeds the mtg-tutor bin)
  core/                        shared; must not import from services/
    config.ts                  pack structure, scoring constants, cache TTL
    model/                     unified Card model, name normalization, RecordedPick contract
    data/                      cache, Scryfall + 17Lands fetchers, merge layer
    scoring/                   card value, pick scoring, explanations
    db/                        SQLite persistence
    ui/                        reusable @clack primitives (card/set pickers, formatting)
  services/
    draft/                     pack generation, bots, engine, deck builder, draft screen
      index.ts  -> run(argv)   the service's entrypoint export
      main.ts                  npm-run shim: run(process.argv.slice(2))
    stats/                     reporting queries + stats screen (index.ts / main.ts)
```

**The service convention.** Each service exports `async function run(argv)` from its `index.ts`; a one-line `main.ts` is the `npm run <service>` target, and `cli.ts` imports the same `run()` so the bin and `npm run` share one code path. Exporting `run()` (rather than running on import) also lets a future web app call the service directly.

**Adding a service:**
1. `src/services/<name>/index.ts` exporting `async function run(argv: string[])`, plus a `main.ts` shim.
2. Add `"<name>": "tsx src/services/<name>/main.ts"` to `package.json` scripts.
3. Optionally add a `case "<name>"` in `cli.ts` for the unified bin.
4. Reuse `core/*`; promote anything shared by 2+ services into `core/`, never the reverse.

Scoring, bots, and the deck builder all share one `cardValue()` function (`core/scoring`), so tuning card evaluation is a single-file change.
