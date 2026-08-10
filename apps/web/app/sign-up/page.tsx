import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { RequestAccess } from "./RequestAccess";

// This used to redirect to WorkOS's sign-up flow. With self-serve registration
// turned off that flow refuses, and a stranger who followed a link here landed
// on an error page belonging to an identity provider they have never heard of,
// with no idea whether the app was broken or they were unwelcome.
//
// So the route stays and stops redirecting. `/sign-up` is already in
// middleware.ts's unauthenticatedPaths, which is what keeps this reachable --
// a page not listed there 307s to sign-in and looks fine in isolation.

export const metadata: Metadata = {
  title: "Invite only",
  description: "P1P1 is in a private beta. Ask for an invite.",
};

export default function SignUp() {
  return (
    <PageShell>
      <section className="max-w-2xl py-6">
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Invite only, for now.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-base-content/70">
          Every graded pick costs real money to coach, so accounts are made from an
          invitation link rather than from a sign-up form. If you have a link, it will
          sign you in and make the account in one go.
        </p>

        <RequestAccess />

        <p className="mt-8 text-sm text-base-content/60">
          Already have an account?{" "}
          {/* A plain anchor, deliberately not next/link: /sign-in is a Route
              Handler that 307s cross-origin, which the client router cannot
              follow as an RSC payload. See UserMenu for the longer version. */}
          <a href="/sign-in" className="link link-primary">
            Sign in
          </a>
          . Or read the{" "}
          <Link href="/principles" className="link link-primary">
            draft principles
          </Link>{" "}
          the coach is grounded in — free, no account needed.
        </p>
      </section>
    </PageShell>
  );
}
