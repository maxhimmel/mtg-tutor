// What one draft costs the database, in the bytes Convex actually bills for.
//
//   pnpm --filter @mtg-tutor/backend bench-io [--set fdn] [--format TradDraft]
//                                             [--seed 42] [--update-baseline]
//
// Convex prices database I/O by the bytes a function moves, and charges for the
// whole document it retrieved rather than the fields it used. So the only honest
// way to judge a change to a read path is to read the byte counter on either
// side of it -- which is what convex/iobench.ts exposes, by wrapping the real
// functions and reporting their transaction metrics.
//
// Reads AND writes, because a saving that only moves work from one to the other
// is not a saving. Storing what a pick saw buys back a read on every coach call
// by paying a write on every pick; the per-draft total is the sum, so that trade
// cannot hide in it.
//
// This drives the same fixture bench-llm does -- a full draft, fixed seed,
// always take the highest-value card -- so the two measure the same run from
// two directions: bench-llm asks what it cost in tokens, this asks what it cost
// in bytes. Neither samples: every pick is measured and the totals are exact,
// because read volume is a pure function of the code and the fixture, with no
// provider or cache in the way.
//
// Spends no model calls. It probes the prompt BUILDERS (coachContext,
// verdictContext, framePrompt), which is where the reads are; what the model
// then does with those prompts costs tokens, not bytes.
//
// The per-draft total weights each path by how often a real draft calls it --
// counts derived from the fixture, not assumed. Coaching and verdicts fire on
// decision picks only, so that count comes from the pack sizes this draft
// actually dealt.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { COACH, cardValue, isDecisionPick } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const seed = Number(flag("seed", 42));
const minPackCards = Number(flag("min-pack-cards", COACH.minPackCards));
const label = flag("label", "");

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- run `convex dev --once` first.");

// Same reason bench-llm renews: a WorkOS access token lasts about five minutes
// and a full probe run takes longer than that.
let token = await accessToken();
const client = new ConvexHttpClient(url);
client.setAuth(token);

async function freshToken() {
  const next = await accessToken();
  if (next !== token) {
    token = next;
    client.setAuth(token);
  }
  return token;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

// ---------------------------------------------------------------- drive a draft

const sessionId = await client.mutation(api.draft.start, { setCode, format, seed });
console.log(`set ${setCode}/${format}, seed ${seed}, session ${sessionId}`);

const samples = new Map();
const record = (path, io) => {
  const list = samples.get(path) ?? [];
  list.push(io);
  samples.set(path, list);
  return io;
};

const stateIo = await client.query(api.iobench.stateCost, { sessionId });
record("draft.state", stateIo);

let state = await client.query(api.draft.state, { sessionId });
const picks = [];

while (!state.complete) {
  await freshToken();
  const pack = state.pack;
  const picked = [...pack].sort((a, b) => cardValue(b) - cardValue(a))[0];

  const { cost, result } = await client.mutation(api.iobench.pickCost, {
    sessionId,
    cardName: picked.name,
  });
  record("draft.pick", cost);

  picks.push({ pickIndex: result.pickIndex, cardsInPack: pack.length });
  state = { complete: result.complete, pack: result.pack, pool: result.pool };

  if (picks.length % 10 === 0) console.log(`  picked ${picks.length}...`);
}
const lastPick = samples.get("draft.pick").at(-1);
console.log(
  `drafted ${picks.length} picks, ${kb(lastPick.bytesRead)} read / ` +
    `${kb(lastPick.bytesWritten)} written on the last one`,
);

// The gate the coach and the review walkthrough both apply. Derived from the
// packs this draft actually dealt rather than assumed from a pack size.
const decisionPicks = picks.filter((p) => isDecisionPick(p.cardsInPack, minPackCards));
console.log(`${decisionPicks.length} decision picks at min-pack-cards ${minPackCards}`);

// ------------------------------------------------------------ probe read paths

console.log("probing prompt builders...");
for (const pick of decisionPicks) {
  await freshToken();
  record(
    "draft.coachContext",
    await client.query(api.iobench.coachContextCost, { sessionId, pickIndex: pick.pickIndex }),
  );
  record(
    "review.verdictContext",
    await client.query(api.iobench.verdictContextCost, { sessionId, pickIndex: pick.pickIndex }),
  );
}

await freshToken();
record("draft.results", await client.query(api.iobench.resultsCost, { sessionId }));
record("review.load", await client.query(api.iobench.reviewLoadCost, { sessionId }));
for (const phase of ["open", "close"]) {
  record(
    "review.framePrompt",
    await client.query(api.iobench.framePromptCost, { sessionId, phase }),
  );
}
record("stats.overview", await client.query(api.iobench.statsOverviewCost, {}));

// Last: it writes, and a verdict written here would make every verdictContext
// after it return the cached row instead of replaying.
console.log("probing saveVerdict...");
for (const pick of decisionPicks) {
  await freshToken();
  record(
    "review.saveVerdict",
    await client.mutation(api.iobench.saveVerdictCost, {
      sessionId,
      pickIndex: pick.pickIndex,
      verdict: {
        contextBestName: "(io probe)",
        divergenceLesson: "(io probe)",
        narrative: "(io probe)",
      },
    }),
  );
}

// ------------------------------------------------------------------- the totals

// How often a real draft + review calls each path. `stats.overview` is per
// visit to the stats page rather than per draft, so it is measured and reported
// but deliberately not folded into the per-draft total.
const CALLS_PER_DRAFT = {
  "draft.state": 1,
  "draft.pick": picks.length,
  "draft.coachContext": decisionPicks.length,
  "review.verdictContext": decisionPicks.length,
  "review.saveVerdict": decisionPicks.length,
  "review.load": 1,
  "draft.results": 1,
  "review.framePrompt": 2,
};

const paths = {};
for (const [path, ios] of samples) {
  const meanOf = (field) => ios.reduce((a, io) => a + io[field], 0) / ios.length;
  const read = meanOf("bytesRead");
  const written = meanOf("bytesWritten");
  const calls = CALLS_PER_DRAFT[path] ?? null;
  paths[path] = {
    sampled: ios.length,
    meanBytesRead: Math.round(read),
    meanBytesWritten: Math.round(written),
    maxBytesRead: Math.max(...ios.map((io) => io.bytesRead)),
    callsPerDraft: calls,
    totalBytesPerDraft: calls == null ? null : Math.round((read + written) * calls),
  };
}

const totalBytesPerDraft = Object.values(paths).reduce(
  (sum, p) => sum + (p.totalBytesPerDraft ?? 0),
  0,
);

const report = {
  setCode,
  format,
  seed,
  minPackCards,
  label: label || undefined,
  picks: picks.length,
  decisionPicks: decisionPicks.length,
  paths,
  totalBytesPerDraft,
};

// ------------------------------------------------------------------- report out

const dir = new URL("../bench/", import.meta.url);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const baselinePath = new URL(`./io-baseline.${setCode}.${format}.${seed}.json`, dir);
const runPath = new URL(`./io.${setCode}.${format}.${seed}.json`, dir);

writeFileSync(runPath, `${JSON.stringify(report, null, 2)}\n`);

const rows = Object.entries(paths).sort(
  (a, b) => (b[1].totalBytesPerDraft ?? 0) - (a[1].totalBytesPerDraft ?? 0),
);

console.log("");
console.log(
  "path".padEnd(24) +
    "read".padStart(11) +
    "write".padStart(10) +
    "calls".padStart(7) +
    "per draft".padStart(12),
);
for (const [path, p] of rows) {
  console.log(
    path.padEnd(24) +
      kb(p.meanBytesRead).padStart(11) +
      kb(p.meanBytesWritten).padStart(10) +
      String(p.callsPerDraft ?? "—").padStart(7) +
      (p.totalBytesPerDraft == null ? "—" : mb(p.totalBytesPerDraft)).padStart(12),
  );
}
console.log(" ".repeat(42) + "─".repeat(12));
console.log("total per draft".padEnd(42) + mb(totalBytesPerDraft).padStart(12));

if (has("update-baseline")) {
  writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwrote baseline ${baselinePath.pathname.split("/").at(-1)}`);
} else if (existsSync(baselinePath)) {
  const base = JSON.parse(readFileSync(baselinePath, "utf8"));
  const delta = totalBytesPerDraft - base.totalBytesPerDraft;
  const factor = base.totalBytesPerDraft / totalBytesPerDraft;
  console.log(`\nbaseline ${mb(base.totalBytesPerDraft)}${base.label ? ` (${base.label})` : ""}`);
  console.log(
    `now      ${mb(totalBytesPerDraft)}  ${delta <= 0 ? "−" : "+"}${mb(Math.abs(delta))}  ` +
      `${factor >= 1 ? `${factor.toFixed(1)}× better` : `${(1 / factor).toFixed(1)}× WORSE`}`,
  );
  console.log("");
  console.log("path".padEnd(24) + "baseline".padStart(12) + "now".padStart(12) + "change".padStart(12));
  for (const [path, p] of rows) {
    const was = base.paths[path]?.meanBytesRead;
    if (was == null) continue;
    const change = was === 0 ? "—" : `${(((p.meanBytesRead - was) / was) * 100).toFixed(0)}%`;
    console.log(
      path.padEnd(24) + kb(was).padStart(12) + kb(p.meanBytesRead).padStart(12) + change.padStart(12),
    );
  }
} else {
  console.log(`\nno baseline yet — rerun with --update-baseline to pin this as the before`);
}
