// OAuth 2.0 Device Authorization Grant (RFC 8628) against WorkOS.
//
// No client secret anywhere: the WorkOS application is configured Public, which
// is what the flow is for -- a distributed CLI cannot keep a secret. The client
// id is not sensitive either; it travels in every browser sign-in URL.
const WORKOS = "https://api.workos.com/user_management";
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function form(path: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${WORKOS}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const payload: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, error_description } = (payload ?? {}) as Record<string, unknown>;
    throw new WorkOsError(
      typeof error === "string" ? error : `http_${res.status}`,
      typeof error_description === "string" ? error_description : `WorkOS returned ${res.status}`,
    );
  }
  return payload;
}

export class WorkOsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requestDeviceAuthorization(clientId: string): Promise<DeviceAuthorization> {
  const r = (await form("authorize/device", { client_id: clientId })) as Record<string, unknown>;

  return {
    deviceCode: String(r.device_code),
    userCode: String(r.user_code),
    verificationUri: String(r.verification_uri),
    verificationUriComplete:
      typeof r.verification_uri_complete === "string" ? r.verification_uri_complete : undefined,
    // The spec's defaults, for a server that omits them.
    expiresInSeconds: typeof r.expires_in === "number" ? r.expires_in : 300,
    intervalSeconds: typeof r.interval === "number" ? r.interval : 5,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Polls until the user finishes in the browser. `authorization_pending` is the
// expected answer for most of this loop, not a failure; `slow_down` means we
// polled too eagerly and must back off permanently, not just once.
export async function pollForTokens(
  clientId: string,
  auth: DeviceAuthorization,
  signal?: { cancelled: boolean },
): Promise<TokenPair> {
  const deadline = Date.now() + auth.expiresInSeconds * 1000;
  let intervalMs = auth.intervalSeconds * 1000;

  for (;;) {
    if (signal?.cancelled) throw new WorkOsError("cancelled", "Sign-in cancelled.");
    if (Date.now() > deadline) {
      throw new WorkOsError("expired_token", "The sign-in code expired. Run the command again.");
    }

    await sleep(intervalMs);

    try {
      const r = (await form("authenticate", {
        grant_type: DEVICE_CODE_GRANT,
        device_code: auth.deviceCode,
        client_id: clientId,
      })) as Record<string, unknown>;

      return { accessToken: String(r.access_token), refreshToken: String(r.refresh_token) };
    } catch (e) {
      if (!(e instanceof WorkOsError)) throw e;

      if (e.code === "authorization_pending") continue;
      if (e.code === "slow_down") {
        intervalMs += 1000;
        continue;
      }
      if (e.code === "access_denied") {
        throw new WorkOsError("access_denied", "Sign-in was declined in the browser.");
      }
      throw e;
    }
  }
}

export async function refreshTokens(clientId: string, refreshToken: string): Promise<TokenPair> {
  const r = (await form("authenticate", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  })) as Record<string, unknown>;

  return { accessToken: String(r.access_token), refreshToken: String(r.refresh_token) };
}

// WorkOS access tokens are JWTs. Reading `exp` locally avoids spending a round
// trip to discover the token expired, and avoids a refresh on every command.
export function expiresWithin(accessToken: string, seconds: number): boolean {
  try {
    const payload = accessToken.split(".")[1];
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    if (typeof exp !== "number") return true;
    return exp * 1000 - Date.now() < seconds * 1000;
  } catch {
    // Unparseable means we cannot vouch for it; refreshing is the safe answer.
    return true;
  }
}
