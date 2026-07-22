import * as p from "@clack/prompts";
import pc from "picocolors";
import { env } from "../../core/env.js";
import { spinner } from "../../core/ui/spinner.js";
import { beginLogin, currentSession, logout } from "../../core/auth/session.js";

export async function runLogin(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" Sign in ")));

  const existing = currentSession();
  if (existing?.convexUrl === env.CONVEX_URL) {
    const again = await p.confirm({ message: "Already signed in. Sign in again?" });
    if (p.isCancel(again) || !again) {
      p.outro("Kept the existing session.");
      return;
    }
  }

  const signal = { cancelled: false };
  const onSigint = () => {
    signal.cancelled = true;
  };
  process.once("SIGINT", onSigint);

  try {
    const { authorization, completed } = await beginLogin(signal);

    p.note(
      `${pc.bold(pc.cyan(authorization.userCode))}\n\n` +
        `Open ${pc.underline(authorization.verificationUriComplete ?? authorization.verificationUri)}\n` +
        pc.dim(`Code expires in ${Math.round(authorization.expiresInSeconds / 60)} minutes.`),
      "Enter this code in your browser",
    );

    const spin = spinner();
    spin.start("Waiting for you to finish in the browser");
    try {
      await completed;
      spin.stop(pc.green("Signed in"));
    } catch (e) {
      spin.stop(pc.red("Sign-in failed"));
      throw e;
    }

    p.outro(`Signed in to ${env.CONVEX_URL}`);
  } catch (e) {
    p.log.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
}

export async function runLogout(): Promise<void> {
  const existing = currentSession();
  if (!existing) {
    console.log("Not signed in.");
    return;
  }
  logout();
  console.log(`Signed out of ${existing.convexUrl}.`);
}
