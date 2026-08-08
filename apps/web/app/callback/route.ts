import { NextResponse, type NextRequest } from "next/server";
import { handleAuth } from "@workos-inc/authkit-nextjs";

import { SIGN_IN_RESTARTED_COOKIE } from "../lib/signInRestart";

// AuthKit enforces PKCE on every callback. handleAuth wants a `state` param and
// the sealed `wos-auth-verifier-*` cookie that getSignInUrl mints alongside it,
// and both exist only when the flow started at our own /sign-in.
//
// A WorkOS invitation link does not start there. The friend authenticates at
// AuthKit, WorkOS marks the invitation accepted and the user active -- so the
// dashboard looks entirely healthy -- and then redirects here with a bare
// `code` and nothing else. handleAuth throws `missing_auth_params` and renders
// a JSON blob suggesting they contact their organization admin, on a page with
// no navigation and no way forward. The account works; the one person who
// needs to know that is the one person who cannot tell.
//
// So a state-less callback is not an error, it is a flow that began on the
// wrong side. Bounce it through /sign-in, which mints the state and the
// verifier and sends them back to AuthKit -- where they are already
// authenticated, so it round-trips without a prompt and lands them signed in.
//
// This cannot loop: /sign-in always attaches state, so the second callback
// takes the branch below instead. A verifier cookie stripped in transit still
// fails there as `missing_pkce_cookie`, which is a different fault and stays
// visible rather than being retried forever.
//
// The durable half of this fix is not in the code: setting the WorkOS
// dashboard's Redirects > Initiate login URL to the deployment's /sign-in makes
// WorkOS route its own flows through us first, so state exists from the start.
// This branch is the floor under that setting being absent, wrong, or not
// honoured for a given flow -- and sign_in_restarted is how we find out which.
const completeSignIn = handleAuth();

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.has("code") && !params.has("state")) {
    const response = NextResponse.redirect(new URL("/sign-in", request.nextUrl));
    response.cookies.set(SIGN_IN_RESTARTED_COOKIE, "1", {
      path: "/",
      maxAge: 300,
      httpOnly: false,
      sameSite: "lax",
    });
    return response;
  }

  return completeSignIn(request);
}
