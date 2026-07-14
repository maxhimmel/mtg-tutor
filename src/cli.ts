import pc from "picocolors";
import { run as runDraft } from "./services/draft/index.js";
import { run as runStats } from "./services/stats/index.js";

const HELP = `${pc.bold("mtg-tutor")} — practice MTG draft with 17Lands-based scoring

Usage:
  mtg-tutor draft                  Browse & pick a set from a searchable list
  mtg-tutor draft <set> [format]   Draft a set directly by code (e.g. dsk, blb)
  mtg-tutor stats                  Show your progress and biggest mistakes
  mtg-tutor help                   Show this help

Examples:
  mtg-tutor draft fdn
  mtg-tutor draft dsk PremierDraft
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "draft":
      await runDraft(rest);
      break;
    case "stats":
      await runStats(rest);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      console.log(pc.red(`Unknown command: ${cmd}\n`));
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
