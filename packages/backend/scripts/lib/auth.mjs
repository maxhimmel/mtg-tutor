// A real WorkOS access token for a headless script.
//
// The draft functions derive ownership from the caller's identity and refuse
// anonymous callers, so anything driving a draft from a terminal needs a token
// the same way the CLI and the browser do. Either paste one in, or let this mint
// one with the password grant using the deployment's own WorkOS credentials.

export async function accessToken() {
  if (process.env.MTG_TUTOR_TOKEN) return process.env.MTG_TUTOR_TOKEN;

  const { SMOKE_EMAIL, SMOKE_PASSWORD, WORKOS_CLIENT_ID, WORKOS_API_KEY } = process.env;
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD || !WORKOS_CLIENT_ID || !WORKOS_API_KEY) {
    throw new Error(
      "This script needs an authenticated user. Set MTG_TUTOR_TOKEN to a WorkOS " +
        "access token, or set SMOKE_EMAIL and SMOKE_PASSWORD for a test user in " +
        "your WorkOS environment (WORKOS_CLIENT_ID and WORKOS_API_KEY come from " +
        "packages/backend/.env.local).",
    );
  }

  const res = await fetch("https://api.workos.com/user_management/authenticate", {
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
