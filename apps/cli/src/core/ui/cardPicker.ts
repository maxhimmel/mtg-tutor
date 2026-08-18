import { SelectPrompt, isCancel } from "@clack/core";
import pc from "picocolors";
import type { Readable, Writable } from "node:stream";
import type { Card, DeckPick } from "@mtg-tutor/core";
import { cardDetail, colorSwatch, ptLine, pct, rarityTag } from "./format.js";

interface PickOption {
  value: string;
  label: string;
  card: Card;
}

// Where a prompt reads its keys and writes its frames. Defaulted to the
// terminal by Clack; named here only so a test can press a key without one,
// which is the whole of how the keybindings below are checked.
export interface PromptIO {
  input?: Readable;
  output?: Writable;
}

const bar = pc.gray("│");

function listRow(card: Card, active: boolean, prefix = "", blind = false): string {
  const marker = active ? pc.cyan("▶ ") : "  ";
  const name = active ? pc.cyan(pc.bold(card.name)) : card.name;
  const pt = ptLine(card);
  const wr = card.gihWinRate != null ? pct(card.gihWinRate) : "—";
  const stats = blind ? "" : `  ${pc.dim(`GIH ${wr}`)}`;
  return `${bar} ${marker}${prefix}${rarityTag(card.rarity)} ${colorSwatch(card.colors)} ${name}${pt ? " " + pc.dim(pt) : ""}${stats}`;
}

function visibleWindow(count: number, cursor: number): [number, number] {
  const rows = process.stdout.rows ?? 24;
  const size = Math.max(5, Math.min(count, rows - 16));
  const start = Math.max(0, Math.min(cursor - Math.floor(size / 2), count - size));
  return [start, Math.min(count, start + size)];
}

// One list, one detail panel, one line of keys. Every prompt in the app that
// shows cards is this shape, so a player who has learned to read the pack can
// read the deck.
function frame(opts: {
  count: number;
  cursor: number;
  message: string;
  row: (index: number) => string;
  detail: Card;
  keys?: string;
  // The detail panel's win rates, off. See cardDetail: a picker asking which
  // card is better must not print the answer under the list.
  blind?: boolean;
}): string {
  const [start, end] = visibleWindow(opts.count, opts.cursor);
  const lines: string[] = [`${pc.cyan("◆")}  ${pc.bold(opts.message)}`];

  if (start > 0) lines.push(`${bar}  ${pc.dim(`… ${start} more above`)}`);
  for (let i = start; i < end; i++) lines.push(opts.row(i));
  if (end < opts.count) lines.push(`${bar}  ${pc.dim(`… ${opts.count - end} more below`)}`);

  lines.push(bar);
  for (const l of cardDetail(opts.detail, undefined, { stats: !opts.blind }).split("\n")) {
    lines.push(`${bar}  ${l}`);
  }
  if (opts.keys) {
    lines.push(bar);
    lines.push(`${bar}  ${pc.dim(opts.keys)}`);
  }
  lines.push(pc.gray("└"));
  return lines.join("\n");
}

const closingLine = (message: string, tag: string) =>
  `${pc.gray("◇")}  ${pc.dim(message)}  ${tag}`;

const options = (cards: Card[]): PickOption[] =>
  cards.map((c) => ({ value: c.name, label: c.name, card: c }));

export async function pickCard(
  cards: Card[],
  message: string,
  // `blind` hides every win rate in the frame. The drills ask which card was
  // right, and the number that answers it is on the same row as the name.
  opts: { blind?: boolean } = {},
): Promise<Card | null> {
  const prompt = new SelectPrompt<PickOption>({
    options: options(cards),
    initialValue: cards[0]?.name,
    render(this: SelectPrompt<PickOption>) {
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = this.options[this.cursor]?.card;
        const tag = this.state === "cancel" ? pc.red("cancelled") : pc.dim(chosen?.name ?? "");
        return closingLine(message, tag);
      }
      return frame({
        count: this.options.length,
        cursor: this.cursor,
        message,
        row: (i) => listRow(this.options[i].card, i === this.cursor, "", opts.blind),
        detail: this.options[this.cursor].card,
        blind: opts.blind,
      });
    },
  });

  const result = await prompt.prompt();
  if (isCancel(result)) return null;
  return cards.find((c) => c.name === result) ?? null;
}

/**
 * What the player did with the pack.
 *
 * Not just a card: the same keystroke that takes a card has to say which pile it
 * goes to, because saying it later means the tallies the coach reads briefly
 * count a card the player already knew they would not play. Same rule the web
 * board works to, where the two piles are two places to drop the card.
 */
export type PackChoice =
  | { kind: "pick"; card: Card; bench: boolean }
  | { kind: "piles" };

// Enter is the deck, because that is where the overwhelming majority of picks
// go. The other pile is a deliberate act and gets its own key.
const PACK_KEYS = "enter maindeck · s sideboard · v view your picks";

export async function pickFromPack(
  cards: Card[],
  message: string,
  io: PromptIO = {},
): Promise<PackChoice | null> {
  // What the key that ended the prompt meant. Boxed rather than a plain local
  // because it is written from a callback, and TypeScript reads a local assigned
  // only inside a closure as still holding the value it was declared with.
  const ended: { intent: "maindeck" | "sideboard" | "piles" } = { intent: "maindeck" };

  const prompt = new SelectPrompt<PickOption>({
    ...io,
    options: options(cards),
    initialValue: cards[0]?.name,
    render(this: SelectPrompt<PickOption>) {
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = this.options[this.cursor]?.card;
        if (this.state === "cancel") return closingLine(message, pc.red("cancelled"));
        if (ended.intent === "piles") return closingLine(message, pc.dim("your picks"));
        const name = chosen?.name ?? "";
        return closingLine(
          message,
          pc.dim(ended.intent === "sideboard" ? `${name} → sideboard` : name),
        );
      }
      return frame({
        count: this.options.length,
        cursor: this.cursor,
        message,
        row: (i) => listRow(this.options[i].card, i === this.cursor),
        detail: this.options[this.cursor].card,
        keys: PACK_KEYS,
      });
    },
  });

  // Setting the state is how a Clack prompt finishes: the keypress that raised
  // this event renders and closes the prompt on its way out, so a second key
  // does the same job as return without pretending to be it.
  prompt.on("key", (char: string) => {
    if (char !== "s" && char !== "v") return;
    ended.intent = char === "s" ? "sideboard" : "piles";
    prompt.state = "submit";
  });

  const result = await prompt.prompt();
  if (isCancel(result)) return null;
  if (ended.intent === "piles") return { kind: "piles" };
  const card = cards.find((c) => c.name === result);
  return card ? { kind: "pick", card, bench: ended.intent === "sideboard" } : null;
}

export interface PileRow extends DeckPick<Card> {
  benched: boolean;
}

const PILE_KEYS = "space move to the other pile · enter done · ctrl-c leave it alone";

/**
 * The two piles, edited in one prompt rather than one prompt per card.
 *
 * Moving cards between the deck and the sideboard is a decision made ten times
 * in a row against the same list, and a fresh prompt for each one reprints the
 * list under the last one. So the cursor stays where it is and the marker
 * changes beside it -- and the rows keep the order they came in, because a card
 * that jumps to the other end of the list is a card you have to find again.
 *
 * The moves are collected here and written by the caller. Nothing waits on a
 * round trip while the cursor is still moving.
 */
export async function editPiles(
  rows: PileRow[],
  message: string,
  io: PromptIO = {},
): Promise<PileRow[] | null> {
  const benched = new Set(rows.filter((r) => r.benched).map((r) => r.pos));
  const mark = (pos: number) => (benched.has(pos) ? pc.yellow("SB ") : "   ");
  const counts = () =>
    `${message}  ${pc.dim(`(maindeck ${rows.length - benched.size} · sideboard ${benched.size})`)}`;

  const prompt = new SelectPrompt<{ value: string; label: string }>({
    ...io,
    options: rows.map((r) => ({ value: String(r.pos), label: r.card.name })),
    initialValue: String(rows[0]?.pos),
    render(this: SelectPrompt<{ value: string; label: string }>) {
      if (this.state === "submit" || this.state === "cancel") {
        const tag =
          this.state === "cancel"
            ? pc.red("left alone")
            : pc.dim(`${rows.length - benched.size} in the deck`);
        return closingLine(message, tag);
      }
      return frame({
        count: rows.length,
        cursor: this.cursor,
        message: counts(),
        row: (i) => listRow(rows[i].card, i === this.cursor, mark(rows[i].pos)),
        detail: rows[this.cursor].card,
        keys: PILE_KEYS,
      });
    },
  });

  prompt.on("key", (char: string) => {
    if (char !== " " && char !== "s") return;
    const { pos } = rows[prompt.cursor];
    if (benched.has(pos)) benched.delete(pos);
    else benched.add(pos);
  });

  if (isCancel(await prompt.prompt())) return null;
  return rows.map((r) => ({ ...r, benched: benched.has(r.pos) }));
}
