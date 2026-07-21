import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { CACHE_TTL_MS } from "../config.js";

const CACHE_DIR = join(homedir(), ".mtg-tutor", "cache");

function ensureDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function pathFor(key: string) {
  return join(CACHE_DIR, `${key.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

export function readCache<T>(key: string, ttlMs = CACHE_TTL_MS): T | undefined {
  const p = pathFor(key);
  if (!existsSync(p)) return undefined;
  if (Date.now() - statSync(p).mtimeMs > ttlMs) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(key: string, value: T): void {
  ensureDir();
  writeFileSync(pathFor(key), JSON.stringify(value), "utf8");
}

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = CACHE_TTL_MS,
): Promise<T> {
  const hit = readCache<T>(key, ttlMs);
  if (hit !== undefined) return hit;
  const fresh = await loader();
  writeCache(key, fresh);
  return fresh;
}
