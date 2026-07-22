import { query } from "./_generated/server.js";

// The WorkOS client id, published so the CLI does not need its own copy.
//
// Deliberately public: an OAuth client id is not a secret -- it travels in the
// browser's authorize URL on every sign-in. Serving it from the deployment
// means the CLI always authenticates against the same WorkOS environment as the
// backend it is talking to, which a second environment variable could not
// guarantee. Point the CLI at prod and it uses prod's identity provider.
export const config = query({
  args: {},
  handler: async () => {
    const clientId = process.env.WORKOS_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "This deployment has no WORKOS_CLIENT_ID, so it cannot authenticate anyone. " +
          "Run `convex dev` to provision AuthKit, or set it with `convex env set`.",
      );
    }
    return { workosClientId: clientId };
  },
});
