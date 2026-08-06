import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Which deployment the set-rebuilding scripts talk to, and what lets them do it.
//
// Both of those answers come from the Convex CLI rather than from the
// environment, which is the point: on Vercel the CLI is pointed at production
// by CONVEX_DEPLOY_KEY, locally it is dev by default and prod with --prod, and
// asking it means the two scripts cannot end up talking to different
// deployments in the same run.
//
// Shared because the URL lookup had already been copied into both, and the key
// lookup would have made it three.

const BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fromCli(name, prod) {
  const args = ["convex", "env", "get", name];
  if (prod) args.push("--prod");
  return execFileSync("npx", args, { cwd: BACKEND, encoding: "utf8" }).trim();
}

// This no longer runs inside `convex deploy --cmd`, so nothing injects the URL
// any more: --cmd is step 1 of a deploy and the function push is step 5, which
// meant anything in there talked to the PREVIOUS deployment. It now runs after
// the deploy returns. An explicit NEXT_PUBLIC_CONVEX_URL still wins if
// something sets one -- but only when nobody asked for prod.
//
// `--prod` is a person naming a deployment out loud, and it has to beat an
// ambient variable or it is not a flag, it is a suggestion. That is not
// hypothetical: check-access loads .env.local for WORKOS_CLIENT_ID, which sets
// CONVEX_URL as a side effect, so --prod silently reported on dev -- with a dev
// user id, under a "prod" heading, which is worse than failing.
export function deploymentUrl(prod) {
  const fromEnv = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (fromEnv && !prod) return fromEnv;

  const url = fromCli("CONVEX_CLOUD_URL", prod);
  if (!url.startsWith("http")) {
    throw new Error(`Could not resolve the Convex deployment URL (got: ${url || "empty"}).`);
  }
  return url;
}

/**
 * The secret that lets a deploy rebuild set data with nobody signed in.
 *
 * Read from the deployment rather than from Vercel's own environment, so the
 * only credential either place needs is the deploy key it already has -- and
 * anyone without that key cannot read this one either. See convex/admin.ts for
 * the other side.
 */
export function deployKey(prod) {
  const key = process.env.MTG_TUTOR_DEPLOY_KEY || fromCli("MTG_TUTOR_DEPLOY_KEY", prod);
  if (!key) {
    throw new Error(
      "MTG_TUTOR_DEPLOY_KEY is not set on this deployment, so rebuilding set data is closed.\n" +
        `Run: pnpm --filter @mtg-tutor/backend exec convex env set MTG_TUTOR_DEPLOY_KEY $(openssl rand -hex 32)${
          prod ? " --prod" : ""
        }`,
    );
  }
  return key;
}
