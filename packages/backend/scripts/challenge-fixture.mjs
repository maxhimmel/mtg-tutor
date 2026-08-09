// Manufacture the half of a challenge you are not playing.
//
//   pnpm challenge-fixture inbound [setCode] [format]   a challenge aimed at you
//   pnpm challenge-fixture outbound <sessionId>         one you sent, already drafted
//   pnpm challenge-fixture finish <sessionId>           bot-finish a draft in progress
//   pnpm challenge-fixture notify <challengeId>         re-send the "they finished" email
//   pnpm challenge-fixture wipe                         remove every fixture
//
// Goes through `npx convex run` rather than the HTTP client on purpose: these
// are internalMutations with no public surface, so the only way in is the CLI,
// which already holds deployment admin credentials. See convex/challengeFixture.ts.
//
// DEV ONLY, structurally: `--prod` is never passed and the deployment comes from
// .env.local. There is nothing to remember and no flag to get wrong.

import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const APP = process.env.APP_URL ?? "http://localhost:3000";

const usage = () => {
  console.log(
    [
      "Manufacture the half of a challenge you are not playing.",
      "",
      "  pnpm challenge-fixture inbound [setCode] [format]",
      "      A challenge aimed at YOU, from a drafter who does not exist.",
      "      Open the link, accept it, and make all the picks yourself --",
      "      accept refuses your own challenge, so this is the only way to",
      "      reach that path without a second account.",
      "",
      "  pnpm challenge-fixture outbound <sessionId>",
      "      A challenge you sent, already drafted by the other side. Straight",
      "      to the diff with your real draft on one side of it.",
      "",
      "  pnpm challenge-fixture finish <sessionId>",
      "      Bot-finish a draft in progress, keeping the picks you made by hand.",
      "      For when you have seen enough of the board and want the diff.",
      "",
      "  pnpm challenge-fixture notify <challengeId>",
      "      Fire the challenger's email again for a challenge that is already",
      "      finished. The one way to test the mail path without redrafting, and",
      "      it names what refused when it does not send.",
      "",
      "  pnpm challenge-fixture wipe",
      "      Remove every fixture session, its pick rows, and any challenge",
      "      either side of which is one.",
    ].join("\n"),
  );
};

/** Whoever the CLI session is signed in as, which is who a fixture is "you". */
async function mySubject() {
  const client = new ConvexHttpClient(process.env.CONVEX_URL);
  client.setAuth(await accessToken());
  const me = await client.query(api.quota.mine, {});
  if (!me?.subject) {
    console.error("Not signed in -- run `pnpm login` first.");
    process.exit(1);
  }
  return me.subject;
}

function run(fn, args, ref) {
  const result = spawnSync(
    "npx",
    ["convex", "run", ref ?? `challengeFixture:${fn}`, JSON.stringify(args)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    // Convex prints the ConvexError message on stderr, which is already written
    // for a person -- passing it through beats wrapping it in one of ours.
    process.stderr.write(result.stderr || "convex run failed\n");
    process.exit(1);
  }

  const out = result.stdout.trim();
  try {
    return JSON.parse(out);
  } catch {
    console.log(out);
    return null;
  }
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "inbound": {
    const [setCode = "fdn", format] = rest.filter((a) => !a.startsWith("--"));
    const answer = run("inbound", { setCode, ...(format ? { format } : {}) });
    console.log(`\nA fixture drafter has challenged you (${answer.picks} picks made).\n`);
    console.log(`  ${APP}${answer.path}\n`);
    console.log("Open it, accept, and draft it out. Your last pick finishes the");
    console.log("challenge and the diff opens with your own draft on the left.");
    console.log("\nBored halfway? pnpm challenge-fixture finish <yourSessionId>");
    break;
  }

  case "outbound": {
    const [sessionId] = rest;
    if (!sessionId) {
      console.error("Which draft? pnpm challenge-fixture outbound <sessionId>");
      process.exit(1);
    }
    // Your WorkOS subject, so the mail has a real user to resolve an address
    // for. Read rather than asked for: `quota.mine` already answers it, and a
    // fixture that makes you paste an id is a fixture you stop using.
    const answer = run("outbound", { sessionId, challengerSubject: await mySubject() });
    console.log(`\nSomebody drafted your packs (${answer.picks} picks).\n`);
    console.log(`  ${APP}${answer.path}\n`);
    break;
  }

  case "finish": {
    const [sessionId] = rest;
    if (!sessionId) {
      console.error("Which draft? pnpm challenge-fixture finish <sessionId>");
      process.exit(1);
    }
    const answer = run("finish", { sessionId });
    console.log(
      answer.already
        ? `That draft was already finished (${answer.picks} picks).`
        : `Finished it — ${answer.picks} picks. The challenge is ready to compare.`,
    );
    break;
  }

  case "notify": {
    const [challengeId] = rest;
    if (!challengeId) {
      console.error("Which challenge? pnpm challenge-fixture notify <challengeId>");
      process.exit(1);
    }
    // The real action, not a copy of it: the point is to exercise the WorkOS
    // lookup and the Resend call exactly as a finished draft does.
    run("notify", { challengeId }, "challenges:notifyChallenger");
    console.log(
      "Asked the deployment to send it. Watch the Convex logs: unconfigured names\n" +
        "the missing variables, and a refusal from Resend is logged with its reason.",
    );
    break;
  }

  case "wipe": {
    const answer = run("wipe", {});
    console.log(
      `Removed ${answer.sessions} fixture session(s), ${answer.picks} pick row(s), ` +
        `${answer.challenges} challenge(s).`,
    );
    break;
  }

  default:
    usage();
    process.exit(command === undefined || command === "--help" ? 0 : 1);
}
