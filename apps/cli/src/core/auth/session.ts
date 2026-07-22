import { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import { env } from "../env.js";
import { clearCredentials, readCredentials, writeCredentials } from "./store.js";
import {
  expiresWithin,
  refreshTokens,
  requestDeviceAuthorization,
  pollForTokens,
  WorkOsError,
  type DeviceAuthorization,
} from "./workos.js";

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in. Run "mtg-tutor login" first.') {
    super(message);
  }
}

// Asked of the deployment rather than configured locally, so the CLI always
// authenticates against the same WorkOS environment as the backend it drives.
async function workosClientId(): Promise<string> {
  const anon = new ConvexHttpClient(env.CONVEX_URL);
  const { workosClientId } = await anon.query(api.auth.config, {});
  return workosClientId;
}

// Refreshes a minute ahead of expiry so a long draft doesn't die mid-pick.
const REFRESH_MARGIN_SECONDS = 60;

async function validAccessToken(): Promise<string> {
  const stored = readCredentials();
  if (!stored) throw new NotSignedInError();

  if (stored.convexUrl !== env.CONVEX_URL) {
    throw new NotSignedInError(
      `You are signed in to ${stored.convexUrl}, but CONVEX_URL is ${env.CONVEX_URL}. ` +
        'Run "mtg-tutor login" to sign in to this deployment.',
    );
  }

  if (!expiresWithin(stored.accessToken, REFRESH_MARGIN_SECONDS)) return stored.accessToken;

  try {
    const fresh = await refreshTokens(await workosClientId(), stored.refreshToken);
    writeCredentials({ ...fresh, convexUrl: env.CONVEX_URL });
    return fresh.accessToken;
  } catch (e) {
    // A rejected refresh token is unrecoverable -- drop it so the next command
    // says "sign in" rather than failing the same way forever.
    clearCredentials();
    throw new NotSignedInError(
      `Your session expired and could not be renewed (${e instanceof Error ? e.message : e}). ` +
        'Run "mtg-tutor login".',
    );
  }
}

/** An authenticated Convex client. Throws NotSignedInError if there's no session. */
export async function convexClient(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(env.CONVEX_URL);
  client.setAuth(await validAccessToken());
  return client;
}

/** For the coach stream, which is a plain fetch and has to carry the token itself. */
export const accessToken = validAccessToken;

export interface LoginPrompt {
  authorization: DeviceAuthorization;
  /** Resolves once the browser side finishes. */
  completed: Promise<void>;
}

/**
 * Starts the device flow and returns immediately with the code to show the
 * user, plus a promise that settles when they finish. Split this way so the
 * caller owns the rendering -- the flow itself knows nothing about clack.
 */
export async function beginLogin(signal?: { cancelled: boolean }): Promise<LoginPrompt> {
  const clientId = await workosClientId();
  const authorization = await requestDeviceAuthorization(clientId);

  const completed = pollForTokens(clientId, authorization, signal).then((tokens) => {
    writeCredentials({ ...tokens, convexUrl: env.CONVEX_URL });
  });

  return { authorization, completed };
}

export function logout(): void {
  clearCredentials();
}

export function currentSession(): { convexUrl: string } | undefined {
  const stored = readCredentials();
  return stored ? { convexUrl: stored.convexUrl } : undefined;
}

export { WorkOsError };
