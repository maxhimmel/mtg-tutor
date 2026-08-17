// Throw away every draft on the dev deployment.
//
//   pnpm wipe-drafts
//
// Deletes sessions, their pools, picks, digests, verdicts, frames and
// challenges. Leaves the ingest pipeline alone -- `sets`, `setCards`,
// `setCardText`, `setCardContext`, `setStats`, `setStatsMeta` -- because those
// cost a Scryfall crawl to rebuild and nothing here has any business in them.
// Also leaves `feedback`, `accessRequests` and `llmUsage`, which record things
// that stay true after the draft they pointed at is gone. See convex/reset.ts.
//
// WHY YOU WILL WANT THIS
//
// Draft data is derived: a session is a deal plus the names its owner picked.
// Any change to how packs are sampled, to `cardValue`, or to the bot policy
// makes every stored draft unreplayable -- corpus.test.ts exists to tell you
// when you have done it -- and the answer is to throw them away and draft
// again, not to migrate them.
//
// DEV ONLY, STRUCTURALLY. `--prod` is never passed and the deployment comes
// from .env.local, the same guarantee scripts/challenge-fixture.mjs gives. To
// wipe production you have to type the `npx convex run ... --prod` out yourself,
// which is the point.

import { spawnSync } from "node:child_process";

const run = spawnSync(
  "npx",
  [
    "convex",
    "run",
    "reset:wipeDrafts",
    JSON.stringify({ confirm: "yes-delete-every-draft" }),
  ],
  { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname },
);

process.exit(run.status ?? 1);
