import { SelectPrompt, isCancel } from "@clack/core";
import pc from "picocolors";
import type { Card } from "@mtg-tutor/core";
import { cardDetail, colorSwatch, ptLine, pct, rarityTag } from "./format.js";

interface PickOption {
  value: string;
  label: string;
  card: Card;
}

const bar = pc.gray("│");

function listRow(card: Card, active: boolean): string {
  const marker = active ? pc.cyan("▶ ") : "  ";
  const name = active ? pc.cyan(pc.bold(card.name)) : card.name;
  const pt = ptLine(card);
  const wr = card.gihWinRate != null ? pct(card.gihWinRate) : "—";
  return `${bar} ${marker}${rarityTag(card.rarity)} ${colorSwatch(card.colors)} ${name}${pt ? " " + pc.dim(pt) : ""}  ${pc.dim(`GIH ${wr}`)}`;
}

function visibleWindow(count: number, cursor: number): [number, number] {
  const rows = process.stdout.rows ?? 24;
  const size = Math.max(5, Math.min(count, rows - 16));
  const start = Math.max(0, Math.min(cursor - Math.floor(size / 2), count - size));
  return [start, Math.min(count, start + size)];
}

function frame(options: PickOption[], cursor: number, message: string): string {
  const [start, end] = visibleWindow(options.length, cursor);
  const lines: string[] = [`${pc.cyan("◆")}  ${pc.bold(message)}`];

  if (start > 0) lines.push(`${bar}  ${pc.dim(`… ${start} more above`)}`);
  for (let i = start; i < end; i++) lines.push(listRow(options[i].card, i === cursor));
  if (end < options.length) lines.push(`${bar}  ${pc.dim(`… ${options.length - end} more below`)}`);

  lines.push(bar);
  const detail = cardDetail(options[cursor].card);
  for (const l of detail.split("\n")) lines.push(`${bar}  ${l}`);
  lines.push(pc.gray("└"));
  return lines.join("\n");
}

export async function pickCard(cards: Card[], message: string): Promise<Card | null> {
  const options: PickOption[] = cards.map((c) => ({ value: c.name, label: c.name, card: c }));

  const prompt = new SelectPrompt<PickOption>({
    options,
    initialValue: options[0]?.value,
    render(this: SelectPrompt<PickOption>) {
      if (this.state === "submit" || this.state === "cancel") {
        const chosen = this.options[this.cursor]?.card;
        const tag = this.state === "cancel" ? pc.red("cancelled") : pc.dim(chosen?.name ?? "");
        return `${pc.gray("◇")}  ${pc.dim(message)}  ${tag}`;
      }
      return frame(this.options, this.cursor, message);
    },
  });

  const result = await prompt.prompt();
  if (isCancel(result)) return null;
  return cards.find((c) => c.name === result) ?? null;
}
