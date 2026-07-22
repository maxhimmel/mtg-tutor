// WorkOS AuthKit issues RS256 JWTs that Convex validates directly -- there is no
// Convex component and no users table. draft.ts only ever needs an opaque owner
// key (identity.tokenIdentifier), so a user row here would be dead weight.
//
// WORKOS_CLIENT_ID is a deployment environment variable, set by `convex dev`
// during AuthKit provisioning (see convex.json) or by `convex env set`.
const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
