import Anthropic from "@anthropic-ai/sdk";

// The ONLY place (besides tutor.ts) that touches the Anthropic SDK. Keeping the
// surface this small means a future web frontend can swap in a different client
// or the Vercel AI SDK without disturbing the grounding logic.

let client: Anthropic | undefined;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to your environment or a .env file to enable AI pick coaching.",
    );
  }
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}
