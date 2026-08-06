import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserIdentity } from "convex/server";
import { parseRoleMap } from "../convex/roles.js";

// roleOf memoizes the env map per isolate, which is the point of it -- so every
// test that cares about the env has to re-import rather than re-assign.
async function rolesWith(env: string | undefined) {
  vi.resetModules();
  if (env === undefined) delete process.env.MTG_TUTOR_ROLES;
  else process.env.MTG_TUTOR_ROLES = env;
  return await import("../convex/roles.js");
}

// Only the two fields roleOf reads. The real identity carries a dozen more and
// none of them are this module's business.
const identity = (fields: { role?: unknown; subject?: string }) =>
  ({
    tokenIdentifier: `https://api.workos.com/user_management/client|${fields.subject ?? "user_1"}`,
    subject: fields.subject ?? "user_1",
    issuer: "https://api.workos.com/user_management/client",
    ...(fields.role === undefined ? {} : { role: fields.role }),
  }) as unknown as UserIdentity;

afterEach(() => {
  delete process.env.MTG_TUTOR_ROLES;
});

describe("parseRoleMap", () => {
  it("reads well-formed pairs", () => {
    const map = parseRoleMap("user_a=owner,user_b=tester");
    expect(map.get("user_a")).toBe("owner");
    expect(map.get("user_b")).toBe("tester");
  });

  it("tolerates whitespace and a trailing comma", () => {
    const map = parseRoleMap(" user_a = owner , ");
    expect(map.get("user_a")).toBe("owner");
    expect(map.size).toBe(1);
  });

  it("is empty for undefined, empty and junk input", () => {
    expect(parseRoleMap(undefined).size).toBe(0);
    expect(parseRoleMap("").size).toBe(0);
    expect(parseRoleMap("nonsense").size).toBe(0);
  });

  // The failure that matters: a misspelled role must not become a role.
  it("drops a pair whose role is not a role", () => {
    const map = parseRoleMap("user_a=admin,user_b=owner");
    expect(map.has("user_a")).toBe(false);
    expect(map.get("user_b")).toBe("owner");
  });
});

describe("roleOf", () => {
  it("takes a valid role claim", async () => {
    const { roleOf } = await rolesWith(undefined);
    expect(roleOf(identity({ role: "tester" }))).toBe("tester");
  });

  // A user in no WorkOS organization has no role claim at all. That is the
  // closed beta, so it has to fail closed rather than fall back to the
  // cheapest tier.
  it("refuses an identity with no role claim", async () => {
    const { roleOf } = await rolesWith(undefined);
    expect(roleOf(identity({}))).toBe("none");
  });

  it("refuses an unrecognised role slug rather than trusting it", async () => {
    const { roleOf } = await rolesWith(undefined);
    expect(roleOf(identity({ role: "admin" }))).toBe("none");
    expect(roleOf(identity({ role: "Owner" }))).toBe("none");
  });

  it("refuses a role claim that is not a string", async () => {
    const { roleOf } = await rolesWith(undefined);
    expect(roleOf(identity({ role: ["owner"] }))).toBe("none");
  });

  it("falls back to the env map when there is no claim", async () => {
    const { roleOf } = await rolesWith("user_1=owner");
    expect(roleOf(identity({ subject: "user_1" }))).toBe("owner");
    expect(roleOf(identity({ subject: "user_2" }))).toBe("none");
  });

  // The env map is an escape hatch, not an override: a working membership must
  // win, or a stale entry quietly outranks the dashboard forever.
  it("prefers the claim over the env map", async () => {
    const { roleOf } = await rolesWith("user_1=beta");
    expect(roleOf(identity({ subject: "user_1", role: "owner" }))).toBe("owner");
  });

  // An unrecognised claim is not a claim, so the escape hatch still opens --
  // which is what makes it usable for repairing a bad membership.
  it("falls through a junk claim to the env map", async () => {
    const { roleOf } = await rolesWith("user_1=owner");
    expect(roleOf(identity({ subject: "user_1", role: "admin" }))).toBe("owner");
  });
});

describe("sourceOf", () => {
  it("names where the role came from", async () => {
    const { sourceOf } = await rolesWith("user_1=owner");
    expect(sourceOf(identity({ subject: "user_1", role: "beta" }))).toBe("claim");
    expect(sourceOf(identity({ subject: "user_1" }))).toBe("env");
    expect(sourceOf(identity({ subject: "user_2" }))).toBe("default");
  });
});

describe("UNLIMITED", () => {
  it("exempts exactly owner and tester", async () => {
    const { UNLIMITED } = await rolesWith(undefined);
    expect([...UNLIMITED].sort()).toEqual(["owner", "tester"]);
  });
});
