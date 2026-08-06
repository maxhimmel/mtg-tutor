// Who the deployment thinks you are, and how much you may spend today.
//
//   pnpm --filter @mtg-tutor/backend check-access [--prod]
//
// Not called `whoami`: pnpm has its own whoami and would run npm's instead of
// this, which fails asking you to log in to a registry.
//
// Two answers in one place, because they fail together and are diagnosed apart.
// The top half is the raw access token, which says whether WorkOS is putting an
// organization and a role in it at all. The bottom half is what Convex made of
// that. A role missing from the token is a WorkOS problem -- no membership, or
// the session predates it -- and a role in the token that Convex reports as
// `default` is ours.
//
// It is also how you find the id MTG_TUTOR_ROLES is keyed on: `subject`.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";
import { deploymentUrl } from "./lib/deployment.mjs";

// Same line every script that signs in as a person carries. A WorkOS access
// token lives about five minutes, so the stored session is almost always due a
// renewal, and renewing needs WORKOS_CLIENT_ID from here. Without it this works
// for the few minutes after a login and then reports "not authenticated" at a
// person who just authenticated.
process.loadEnvFile(new URL("../.env.local", import.meta.url));

const prod = process.argv.includes("--prod");

const token = await accessToken();
const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

const client = new ConvexHttpClient(deploymentUrl(prod));
client.setAuth(token);

const quota = await client.query(api.quota.mine, {});

console.log(`\nAccess token (${prod ? "prod" : "dev"})`);
console.log(`  sub      ${claims.sub}`);
console.log(`  org_id   ${claims.org_id ?? "(absent)"}`);
console.log(`  role     ${claims.role ?? "(absent)"}`);

if (!quota) {
  console.log("\nConvex rejected the token -- it did not see an identity at all.");
  process.exit(1);
}

console.log("\nConvex sees");
console.log(`  subject  ${quota.subject}`);
console.log(`  role     ${quota.role}`);
console.log(`  source   ${quota.source}`);
console.log(
  `  today    ${
    quota.remaining
      ? `${quota.remaining.drafts}/${quota.of.drafts} drafts, ${quota.remaining.reviews}/${quota.of.reviews} reviews`
      : "unlimited"
  }`,
);

// Said plainly rather than left to be inferred from three fields, because the
// interesting cases all look similar at a glance and only one of them is fine.
const verdict =
  quota.source === "claim"
    ? "The organization membership is reaching Convex. This is what you want."
    : quota.role === "none"
      ? claims.role
        ? `The token carries role "${claims.role}", which is not one this app knows. ` +
          "Check the role slugs in WorkOS -- they must be owner, tester or beta."
        : "No role in the token. Either you are in no WorkOS organization, or this " +
          "session was minted before you joined one -- sign out and in again first."
      : `Running on MTG_TUTOR_ROLES, not on the membership. Fine as an escape hatch, ` +
        "but the organization is not reaching Convex and nobody else will get a role.";

console.log(`\n${verdict}\n`);
