import { Prompt, isCancel } from "@clack/core";
import pc from "picocolors";
import type { SetInfo } from "../data/sets.js";

const bar = pc.gray("│");

function match(sets: SetInfo[], query: string): SetInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return sets;
  return sets.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
}

function row(set: SetInfo, active: boolean): string {
  const marker = active ? pc.cyan("▶ ") : "  ";
  const name = active ? pc.cyan(pc.bold(set.name)) : set.name;
  const code = pc.dim(set.code.toUpperCase());
  const year = set.releasedAt ? pc.dim(set.releasedAt.slice(0, 4)) : "";
  return `${bar} ${marker}${name}  ${code}${year ? "  " + year : ""}`;
}

export async function pickSet(sets: SetInfo[]): Promise<SetInfo | null> {
  let filtered = sets;
  let selected = 0;

  const prompt = new Prompt(
    {
      render(this: Prompt) {
        const query = (this.value as string) ?? "";
        if (this.state === "submit" || this.state === "cancel") {
          const chosen = filtered[selected];
          const tag =
            this.state === "cancel" ? pc.red("cancelled") : pc.dim(chosen ? `${chosen.name} (${chosen.code.toUpperCase()})` : "");
          return `${pc.gray("◇")}  Choose a set  ${tag}`;
        }

        const rows = process.stdout.rows ?? 24;
        const size = Math.max(5, Math.min(filtered.length, rows - 8));
        const start = Math.max(0, Math.min(selected - Math.floor(size / 2), filtered.length - size));
        const end = Math.min(filtered.length, start + size);

        const lines: string[] = [
          `${pc.cyan("◆")}  ${pc.bold("Choose a set")} ${pc.dim("(type to filter by name or code)")}`,
          `${bar}  ${pc.dim("›")} ${query}${pc.inverse(" ")}`,
          bar,
        ];
        if (filtered.length === 0) {
          lines.push(`${bar}  ${pc.dim("no matching sets")}`);
        } else {
          if (start > 0) lines.push(`${bar}  ${pc.dim(`… ${start} more above`)}`);
          for (let i = start; i < end; i++) lines.push(row(filtered[i], i === selected));
          if (end < filtered.length) lines.push(`${bar}  ${pc.dim(`… ${filtered.length - end} more below`)}`);
        }
        lines.push(pc.gray("└"));
        return lines.join("\n");
      },
    },
    true, // trackValue: this.value follows the typed query
  );

  prompt.on("value", () => {
    filtered = match(sets, (prompt.value as string) ?? "");
    if (selected > filtered.length - 1) selected = Math.max(0, filtered.length - 1);
  });
  prompt.on("cursor", (key: string) => {
    if (key === "up") selected = Math.max(0, selected - 1);
    else if (key === "down") selected = Math.min(filtered.length - 1, selected + 1);
  });

  const result = await prompt.prompt();
  if (isCancel(result)) return null;
  return filtered[selected] ?? null;
}
