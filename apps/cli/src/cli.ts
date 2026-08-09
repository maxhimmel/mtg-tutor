import pc from "picocolors";
import { run as runDraft } from "./services/draft/index.js";
import { run as runStats } from "./services/stats/index.js";
import { run as runReview } from "./services/review/index.js";
import { run as runChallenge } from "./services/challenge/index.js";
import { runLogin, runLogout } from "./services/auth/index.js";

const HELP = `${pc.bold("mtg-tutor")} — practice MTG draft with 17Lands-based scoring

Usage:
  mtg-tutor draft                    Browse & pick a set from those already ingested
  mtg-tutor draft <set> [format]     Draft a set by code (ingests it if it's new)
  mtg-tutor draft --resume <id>      Pick an abandoned draft back up
  mtg-tutor draft --challenge <id>   Take up a friend's challenge -- their packs, your pod
  mtg-tutor challenge [id]           Dare a friend to draft one of your finished drafts
  mtg-tutor review [id]              Review a past draft pick-by-pick (quiz yourself)
  mtg-tutor review [id] --passive    Step through without the guessing prompts
  mtg-tutor review [id] --breakdown  Print the whole diagnostic at once (no stepping)
  mtg-tutor stats                    Show your progress and biggest mistakes
  mtg-tutor login                    Sign in (drafts are stored against your account)
  mtg-tutor logout                   Forget the stored session
  mtg-tutor help                     Show this help

Examples:
  mtg-tutor draft fdn
  mtg-tutor draft dsk PremierDraft
  mtg-tutor review
  mtg-tutor challenge
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "draft":
      await runDraft(rest);
      break;
    case "review":
      await runReview(rest);
      break;
    case "challenge":
      await runChallenge(rest);
      break;
    case "stats":
      await runStats(rest);
      break;
    case "login":
      await runLogin();
      break;
    case "logout":
      await runLogout();
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
