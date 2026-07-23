// Shared knowledge of the 17Lands public datasets: where they live, which ones a
// set must publish before we will ingest it, and a cheap availability probe.

const UA = "mtg-tutor/0.1 (draft-trainer)";

// The three public datasets 17Lands publishes per (set, format).
export const KINDS = ["draft", "game", "replay"];

// What the stats pipeline actually reads. Replay is published but unused today
// (see notes.md Ideas #2); it still counts toward availability below, because a
// set that is missing any dataset is a set with incomplete public coverage.
export const USED_KINDS = ["draft", "game"];

export function datasetUrl(kind, setCode, format) {
  return (
    `https://17lands-public.s3.amazonaws.com/analysis_data/${kind}_data/` +
    `${kind}_data_public.${setCode.toUpperCase()}.${format}.csv.gz`
  );
}

// HEAD each dataset -- no body downloaded -- so a set can be gated in well under
// a second. A set is "available" only when every KIND exists for the format;
// 17Lands serves 403/404 for a key it does not have, so `res.ok` is the signal.
export async function checkAvailability(setCode, format, kinds = KINDS) {
  const results = await Promise.all(
    kinds.map(async (kind) => {
      const url = datasetUrl(kind, setCode, format);
      try {
        const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
        return { kind, ok: res.ok, bytes: Number(res.headers.get("content-length") || 0) };
      } catch {
        return { kind, ok: false, bytes: 0 };
      }
    }),
  );
  return {
    available: results.every((r) => r.ok),
    present: results.filter((r) => r.ok),
    missing: results.filter((r) => !r.ok).map((r) => r.kind),
    results,
  };
}

// The set's real name, for a readable "<name> isn't available" note. Best effort
// -- an unknown code just yields the code back to the caller.
export async function scryfallSetName(setCode) {
  try {
    const res = await fetch(`https://api.scryfall.com/sets/${setCode.toLowerCase()}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()).name ?? null;
  } catch {
    return null;
  }
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)}MB`;

// Formats the availability verdict as the note the user sees. Returns the same
// string whether it is a success line or the "not available" refusal, so callers
// can print it directly.
export async function availabilityNote(setCode, format, report) {
  const name = (await scryfallSetName(setCode)) ?? setCode.toUpperCase();
  if (report.available) {
    const sizes = report.present.map((r) => `${r.kind} ${mb(r.bytes)}`).join(", ");
    return `${name} (${setCode.toUpperCase()}) is available for ${format}: ${sizes}`;
  }
  return (
    `${name} (${setCode.toUpperCase()}) isn't available for ${format} — ` +
    `missing ${report.missing.join(", ")} dataset${report.missing.length > 1 ? "s" : ""}. ` +
    `A set is only ingested when 17Lands publishes all of ${KINDS.join(", ")}.`
  );
}
