import * as p from "@clack/prompts";
import { convexClient } from "../../core/auth/session.js";
import { humanError } from "../../core/ui/humanError.js";
import { runMisses } from "./misses.js";

// The drills, from the command line. One so far; the argument is here rather
// than assumed so that adding the second one is a case rather than a rewrite of
// what `mtg-tutor practice` means.
//
// The command is `practice` and the code is `drills`, which is the same split
// the web makes: the nav says Practice, the routes and the events say drills.
// One of those can be changed this afternoon and the other cannot.
const DRILLS = { misses: runMisses };

export async function run(argv: string[]): Promise<void> {
  const name = (argv.find((a) => !a.startsWith("--")) ?? "misses") as keyof typeof DRILLS;
  const drill = DRILLS[name];

  if (!drill) {
    p.log.error(`No drill called "${name}". Available: ${Object.keys(DRILLS).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  try {
    await drill(await convexClient());
  } catch (e) {
    p.log.error(humanError(e));
    process.exitCode = 1;
  }
}
