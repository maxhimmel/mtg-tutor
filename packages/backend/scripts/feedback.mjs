// Everything the beta has said, formatted to be pasted into a coding session.
//
//   pnpm --filter @mtg-tutor/backend feedback [--prod] [--limit 100]
//        [--since 2026-08-01] [--surface coach] [--json]
//
// The filter form rather than `pnpm feedback --prod`, and for a boring reason:
// --prod is one of pnpm's own flags, so the short form is a coin flip on which
// of the two reads it. check-access.mjs documents itself the same way.
//
// Markdown to stdout and everything else to stderr, so `pnpm ... feedback |
// pbcopy` gives exactly the payload and nothing about how it was fetched.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";
import { deploymentUrl } from "./lib/deployment.mjs";

// Same line every script that signs in as a person carries. A WorkOS access
// token lives about five minutes, so the stored session is almost always due a
// renewal, and renewing needs WORKOS_CLIENT_ID from here.
process.loadEnvFile(new URL("../.env.local", import.meta.url));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const prod = argv.includes("--prod");
const json = argv.includes("--json");
const limit = Number(flag("limit", 100));
const since = flag("since");
const surface = flag("surface");

const url = deploymentUrl(prod);

// accessToken() refuses a session minted against a different deployment, but it
// checks CONVEX_URL -- which loadEnvFile above just set to the dev one. Without
// this line, --prod signs in as your dev user and quietly reports on dev.
process.env.CONVEX_URL = url;

let token;
try {
  token = await accessToken();
} catch (e) {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}

const client = new ConvexHttpClient(url);
client.setAuth(token);

let rows;
try {
  rows = await client.query(api.feedback.all, { limit });
} catch (e) {
  // "That is not yours to read" is an answer rather than a crash, and a stack
  // trace would bury the sentence that says which deployment refused you.
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}

const kept = rows
  .filter((r) => (since ? r.createdAt >= since : true))
  .filter((r) => (surface ? r.surface === surface : true))
  // Reversed. The query orders desc so it can bound what it reads, but a model
  // reads a transcript top to bottom, and the newest note wants to be the one
  // nearest whatever instruction follows the paste.
  .reverse();

if (json) {
  console.log(JSON.stringify(kept, null, 2));
  process.exit(0);
}

if (kept.length === 0) {
  console.error(`\nNothing said yet on ${prod ? "prod" : "dev"}.\n`);
  process.exit(0);
}

const THUMB = { up: "up", down: "down" };

const tally = (pick) => {
  const counts = new Map();
  for (const row of kept) {
    const key = pick(row);
    if (key === undefined) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${k} ${n}`).join(", ");
};

const out = [];

out.push(`# Beta feedback -- ${kept.length} note${kept.length === 1 ? "" : "s"}, ` +
  `${kept[0].createdAt.slice(0, 10)} to ${kept[kept.length - 1].createdAt.slice(0, 10)} ` +
  `(${prod ? "production" : "dev"})`);
out.push("");
out.push(tally((r) => r.sentiment && THUMB[r.sentiment]) || "no thumbs");
out.push(tally((r) => r.surface));
out.push("");

// Not decoration, and the highest-value lines in the output. Without them a
// reader takes the fenced block under somebody's blockquote for their own words
// and goes off to fix the wrong thing entirely.
out.push("> A `coach said` block is the AI's own words, snapshotted in the browser at the");
out.push("> moment of the complaint -- it is NOT the person speaking. A `verdict said` or");
out.push("> `frame said` block is read back from the stored row. The quoted line under each");
out.push("> heading IS the person.");
out.push("");

kept.forEach((row, i) => {
  const thumb = row.sentiment ? ` ${THUMB[row.sentiment]}` : "";
  out.push("---");
  out.push("");
  out.push(`## ${i + 1} - ${row.surface}${thumb} - ${row.createdAt}`);

  const a = row.anchor ?? {};
  const where = [
    // subject, not userId: the tokenIdentifier is the same sixty-character
    // issuer prefix on every row, and subject is both the short half and the
    // PostHog distinctId, so it is the one worth printing.
    `${row.subject} (${row.role})`,
    row.route,
    a.setCode && `${a.setCode}${a.format ? `/${a.format}` : ""}`,
    a.sessionId && `session=${a.sessionId}`,
    a.pickIndex !== undefined && `pick=${a.pickIndex}`,
    a.phase && `phase=${a.phase}`,
  ].filter(Boolean);
  out.push(where.join(" - "));
  out.push("");

  if (row.note) {
    for (const line of row.note.split("\n")) out.push(`> ${line}`);
    out.push("");
  } else {
    out.push("_(a thumb, with no words)_");
    out.push("");
  }

  // quote is the browser's snapshot and only ever exists for the coach; context
  // is the join, and only ever for a verdict or a frame. They cannot both be
  // set, so the label follows whichever arrived.
  const prose = row.quote ?? row.context;
  if (prose) {
    out.push(`${row.surface} said:`);
    // Tilde fences, because coach prose cites principle ids in brackets and a
    // note is free to contain a backtick fence of its own.
    out.push("~~~");
    out.push(prose);
    out.push("~~~");
    out.push("");
  }
});

console.log(out.join("\n"));
