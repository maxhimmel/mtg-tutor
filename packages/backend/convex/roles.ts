import { ConvexError } from "convex/values";
import type { UserIdentity } from "convex/server";
import type { QueryCtx } from "./_generated/server.js";

// Who is allowed to spend the deployment's model key, and how much.
//
// The source of truth is the caller's WorkOS organization membership. AuthKit
// puts `role` on the access token as a first-class claim -- no JWT template,
// nothing for a `convex deploy` to overwrite -- and Convex hands custom claims
// straight through on the identity. So answering "who is this" costs no
// database read, which is the whole reason roles live here rather than in a
// users table (see auth.config.ts for the older half of that decision).
//
// requireUserId in sessions.ts is deliberately untouched. Reading your own
// drafts is free and always was; only creating a session or calling a model
// asks this module anything.

export type Role = "owner" | "tester" | "beta" | "none";

const ROLES = new Set<Role>(["owner", "tester", "beta"]);

export const UNLIMITED: ReadonlySet<Role> = new Set<Role>(["owner", "tester"]);

/**
 * The lockout escape hatch: `subject=role` pairs on a deployment env var.
 *
 * A membership set wrong in the dashboard locks someone out of the thing that
 * would let them fix it, and the account most worth protecting from that is the
 * one that administers the rest. Read after the claim, so it cannot silently
 * mask a role that is working, and parsed once per isolate rather than per
 * call, so the escape hatch costs nothing to carry.
 */
let cached: Map<string, Role> | undefined;

/** Exported for its own test: a typo in here is an outage, not a warning. */
export function parseRoleMap(raw: string | undefined): Map<string, Role> {
  const map = new Map<string, Role>();
  for (const pair of (raw ?? "").split(",")) {
    const [subject, role] = pair.split("=").map((part) => part.trim());
    if (subject && ROLES.has(role as Role)) map.set(subject, role as Role);
  }
  return map;
}

function roleMap(): Map<string, Role> {
  return (cached ??= parseRoleMap(process.env.MTG_TUTOR_ROLES));
}

/**
 * A caller with no organization membership has no `role` claim at all, and that
 * is the whole of the closed beta: they can sign in, and they can do nothing.
 * An unrecognised slug lands in the same place on purpose -- a typo in the
 * dashboard should cost someone their access rather than grant it.
 */
export function roleOf(identity: UserIdentity): Role {
  const claimed = identity.role;
  if (typeof claimed === "string" && ROLES.has(claimed as Role)) return claimed as Role;

  return roleMap().get(identity.subject) ?? "none";
}

/** Where a role came from. Only ever read by quota.mine, which exists to answer this. */
export function sourceOf(identity: UserIdentity): "claim" | "env" | "default" {
  if (typeof identity.role === "string" && ROLES.has(identity.role as Role)) return "claim";
  return roleMap().has(identity.subject) ? "env" : "default";
}

export interface Caller {
  /** The same opaque owner key draftSessions.userId holds. */
  userId: string;
  /** The WorkOS user id, which is what MTG_TUTOR_ROLES is keyed on. */
  subject: string;
  role: Role;
}

/** requireUserId plus the role, from the one identity lookup they share. */
export async function requireCaller(ctx: QueryCtx): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("You need to be signed in to do that.");

  return {
    userId: identity.tokenIdentifier,
    subject: identity.subject,
    role: roleOf(identity),
  };
}

/**
 * requireCaller plus the top role. The read side of the owner's own tools.
 *
 * admin.ts is the other door and is not this one. It exists for a caller with no
 * identity at all -- a deploy running with nobody present -- so it fails closed
 * on a missing MTG_TUTOR_DEPLOY_KEY and refuses with a sentence about rebuilding
 * set data. Neither is true of somebody reading their friends' notes at a
 * terminal, and widening that shared key from "may re-crawl Scryfall" to "may
 * read everything anyone has written" is not a trade worth the reuse.
 */
export async function requireOwner(ctx: QueryCtx): Promise<Caller> {
  const caller = await requireCaller(ctx);
  if (caller.role !== "owner") throw new ConvexError("That is not yours to read.");
  return caller;
}
