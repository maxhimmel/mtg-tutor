import { ConvexError } from "convex/values";
import type { UserIdentity } from "convex/server";
import { roleOf } from "./roles.js";

// The two functions that rebuild a set's data are reachable by anyone who knows
// the deployment URL, and neither is a user action: `storeSetStats` writes
// ~270KB documents and `ingest` crawls Scryfall. Convex bills the bytes a
// function moves, so leaving them open is an invitation to drain the tier.
//
// Two doors and no third, because there are exactly two legitimate callers. The
// deploy runs them without a person present (scripts/seed-set-stats.mjs,
// scripts/ingest-sets.mjs), and the CLI runs `ingest` on demand for whoever is
// drafting a set that is not in yet -- which is only ever the owner.

// A mutation ctx and an action ctx agree on this much, which is all that is
// needed, and taking the shape rather than either concrete type is what lets
// one function guard both.
interface AuthedCtx {
  auth: { getUserIdentity: () => Promise<UserIdentity | null> };
}

export async function requireDeployerOrAdmin(
  ctx: AuthedCtx,
  deployKey: string | undefined,
): Promise<void> {
  const expected = process.env.MTG_TUTOR_DEPLOY_KEY;

  // Fails closed, and names its own remedy: the failure this creates is a
  // deploy that quietly stops updating sets, which nothing else would report.
  if (!expected) {
    throw new ConvexError(
      "This deployment has no MTG_TUTOR_DEPLOY_KEY set, so rebuilding set data is closed. " +
        "Run: convex env set MTG_TUTOR_DEPLOY_KEY $(openssl rand -hex 32)",
    );
  }

  if (deployKey === expected) return;

  const identity = await ctx.auth.getUserIdentity();
  if (identity && roleOf(identity) === "owner") return;

  throw new ConvexError("Rebuilding set data is not something you can do.");
}
