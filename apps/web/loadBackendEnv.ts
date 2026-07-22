import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `convex dev` provisions the WorkOS credentials into packages/backend/.env.local,
// but Next only reads its own .env.local, so the same values were being kept in
// sync by hand in two files.
//
// Only fills in what Next has not already loaded, so apps/web/.env.local still
// wins on conflict. In a deployed build the backend file does not exist and this
// is a no-op -- Vercel supplies everything through the real environment.
const backendEnv = fileURLToPath(new URL("../../packages/backend/.env.local", import.meta.url));

if (existsSync(backendEnv)) {
  for (const line of readFileSync(backendEnv, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
