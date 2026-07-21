import { showStats } from "./screen.js";

// Stats service entrypoint. Takes no arguments today; the signature matches the
// other services so the CLI can dispatch to it uniformly.
export async function run(_argv: string[]): Promise<void> {
  showStats();
}
