// A real WorkOS access token for a headless script.
//
// The draft functions derive ownership from the caller's identity and refuse
// anonymous callers, so anything driving a draft from a terminal needs a token
// the same way the CLI and the browser do. Three sources, in order:
//
//   1. MTG_TUTOR_TOKEN -- an explicit override, for CI or a one-off.
//   2. The CLI's own stored session, if you have run `pnpm login`. Preferred:
//      no password is written down anywhere, and the refresh token renews it
//      indefinitely without another sign-in.
//   3. SMOKE_EMAIL / SMOKE_PASSWORD -- the password grant, for a dedicated test
//      user in an environment where an interactive login is not possible.

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const WORKOS = "https://api.workos.com/user_management";

// Same location and same override the CLI uses, so `pnpm login` and these
// scripts share one session rather than each holding their own.
const credentialsPath = () =>
  process.env.MTG_TUTOR_CREDENTIALS_PATH ?? join(homedir(), ".mtg-tutor", "credentials.json");

function readCredentials() {
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath(), "utf8"));
    const { accessToken, refreshToken, convexUrl } = parsed ?? {};
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") return undefined;
    if (typeof convexUrl !== "string") return undefined;
    return { accessToken, refreshToken, convexUrl };
  } catch {
    // Missing or corrupt reads as "not logged in" -- the recovery is the same.
    return undefined;
  }
}

function expiresWithin(accessToken, seconds) {
  try {
    const payload = accessToken.split(".")[1];
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number") return true;
    return exp * 1000 - Date.now() < seconds * 1000;
  } catch {
    // Unparseable means we cannot vouch for it; refreshing is the safe answer.
    return true;
  }
}

async function post(path, body) {
  const res = await fetch(`${WORKOS}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload?.error_description ?? payload?.error ?? `HTTP ${res.status}`;
    throw new Error(`WorkOS ${path} failed: ${detail}`);
  }
  return payload;
}

/**
 * Renews the CLI's session and writes the result back.
 *
 * The write-back is not optional: WorkOS rotates the refresh token on every
 * use, so a run that refreshed and kept the new token to itself would leave the
 * stored one spent and silently sign you out of the CLI.
 */
async function renew(stored, clientId) {
  const fresh = await post("authenticate", {
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    client_id: clientId,
  });

  const next = {
    accessToken: String(fresh.access_token),
    refreshToken: String(fresh.refresh_token),
    convexUrl: stored.convexUrl,
  };

  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  // 0600, matching the CLI: this file is a bearer token for the account.
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next.accessToken;
}

export async function accessToken() {
  if (process.env.MTG_TUTOR_TOKEN) return process.env.MTG_TUTOR_TOKEN;

  const stored = readCredentials();
  if (stored) {
    const target = process.env.CONVEX_URL;
    // The same guard the CLI applies. A session is minted against one
    // deployment and is not valid on another, so pointing a dev login at prod
    // has to fail loudly here rather than as an opaque 401 mid-draft.
    if (target && stored.convexUrl !== target) {
      throw new Error(
        `You are signed in to ${stored.convexUrl}, but CONVEX_URL is ${target}. ` +
          'Run "pnpm login" against this deployment.',
      );
    }

    const clientId = process.env.WORKOS_CLIENT_ID;
    // Renewed a minute ahead of expiry so a long run cannot die mid-draft.
    if (!expiresWithin(stored.accessToken, 60)) return stored.accessToken;
    if (clientId) return await renew(stored, clientId);
  }

  const { SMOKE_EMAIL, SMOKE_PASSWORD, WORKOS_CLIENT_ID, WORKOS_API_KEY } = process.env;
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD || !WORKOS_CLIENT_ID || !WORKOS_API_KEY) {
    throw new Error(
      "This script needs an authenticated user. Easiest: run `pnpm login` once " +
        "and this will reuse (and renew) that session. Otherwise set " +
        "MTG_TUTOR_TOKEN to an access token, or SMOKE_EMAIL and SMOKE_PASSWORD " +
        "for a test user in your WorkOS environment.",
    );
  }

  // Deliberately JSON rather than going through post() above: this is the shape
  // that was already working here, and the refresh path's form encoding is not
  // a change worth making to a grant that cannot be exercised without a test
  // user's password to hand.
  const res = await fetch(`${WORKOS}/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: WORKOS_CLIENT_ID,
      client_secret: WORKOS_API_KEY,
      email: SMOKE_EMAIL,
      password: SMOKE_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`WorkOS password grant failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}
