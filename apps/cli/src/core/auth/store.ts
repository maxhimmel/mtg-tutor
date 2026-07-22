import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export interface Credentials {
  accessToken: string;
  refreshToken: string;
  /** Which deployment these belong to -- tokens from dev are not valid on prod. */
  convexUrl: string;
}

// Sits beside stats.db, and is overridable for the same reason.
const credentialsPath = () =>
  process.env.MTG_TUTOR_CREDENTIALS_PATH ?? join(homedir(), ".mtg-tutor", "credentials.json");

export function readCredentials(): Credentials | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(credentialsPath(), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;

    const { accessToken, refreshToken, convexUrl } = parsed as Record<string, unknown>;
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") return undefined;
    if (typeof convexUrl !== "string") return undefined;

    return { accessToken, refreshToken, convexUrl };
  } catch {
    // Missing or corrupt reads as "not logged in" -- the recovery is the same.
    return undefined;
  }
}

export function writeCredentials(credentials: Credentials): void {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  // 0600: this file is a bearer token for the user's account.
  writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
}

export function clearCredentials(): void {
  rmSync(credentialsPath(), { force: true });
}
