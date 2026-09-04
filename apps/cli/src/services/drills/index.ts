import * as p from "@clack/prompts";
import { convexClient } from "../../core/auth/session.js";
import { humanError } from "../../core/ui/humanError.js";
import { runArchetypes } from "./archetypes.js";
import { runDeckSpeed } from "./deckSpeed.js";
import { runMisses } from "./misses.js";

// The drills, from the command line. The argument was here before there was a
// second one to pass, so adding it was a case rather than a rewrite of what
// `mtg-tutor practice` means -- which is what it was for.
//
// The command is `practice` and the code is `drills`, which is the same split
// the web makes: the nav says Practice, the routes and the events say drills.
// One of those can be changed this afternoon and the other cannot.
//
// `misses` stays the default because it is the one built out of your own
// drafts, and somebody typing `practice` with nothing after it is asking for
// the personal one. `archetypes` and `deck-speed` both work with no drafts at
// all -- they read a set's statistics and nothing of yours.
//
// The key is kebab-case where the DrillId is camel. The id is a storage key and
// reaches PostHog; this is what somebody types.
const DRILLS = { misses: runMisses, archetypes: runArchetypes, "deck-speed": runDeckSpeed };

export async function run(argv: string[]): Promise<void> {
  const name = (argv.find((a) => !a.startsWith("--")) ?? "misses") as keyof typeof DRILLS;
  const drill = DRILLS[name];

  if (!drill) {
    p.log.error(`No drill called "${name}". Available: ${Object.keys(DRILLS).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  try {
    // Every drill takes the remaining argv, so a drill with flags of its own --
    // `practice archetypes --set fdn` -- needs no dispatch change to get them.
    await drill(await convexClient(), argv);
  } catch (e) {
    p.log.error(humanError(e));
    process.exitCode = 1;
  }
}
