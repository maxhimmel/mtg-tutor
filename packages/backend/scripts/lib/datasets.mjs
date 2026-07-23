// Shared knowledge of the 17Lands public datasets: where they live, which ones a
// set must publish before we will ingest it, and a cheap availability probe.

const UA = "mtg-tutor/0.1 (draft-trainer)";

// The three public datasets 17Lands publishes per (set, format).
export const KINDS = ["draft", "game", "replay"];

// What the stats pipeline actually reads, and therefore what gates ingestion: a
// set is ingestable when draft and game exist. Replay is published but unused
// today (see notes.md Ideas #2), so its absence does not block -- it is still
// probed and reported, so the day we consume it we can see which sets have it.
export const USED_KINDS = ["draft", "game"];

export function datasetUrl(kind, setCode, format) {
  return (
    `https://17lands-public.s3.amazonaws.com/analysis_data/${kind}_data/` +
    `${kind}_data_public.${setCode.toUpperCase()}.${format}.csv.gz`
  );
}

// HEAD every dataset -- no body downloaded -- so a set can be gated in well under
// a second. 17Lands serves 403/404 for a key it does not have, so `res.ok` is
// the signal. Availability is judged only on `required` (the datasets we read);
// the rest are probed for reporting, so `optionalMissing` can flag e.g. a set
// that has draft+game but no replay.
export async function checkAvailability(setCode, format, required = USED_KINDS) {
  const results = await Promise.all(
    KINDS.map(async (kind) => {
      const url = datasetUrl(kind, setCode, format);
      try {
        const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
        return { kind, ok: res.ok, bytes: Number(res.headers.get("content-length") || 0) };
      } catch {
        return { kind, ok: false, bytes: 0 };
      }
    }),
  );
  const isRequired = (r) => required.includes(r.kind);
  return {
    available: results.filter(isRequired).every((r) => r.ok),
    present: results.filter((r) => r.ok),
    missing: results.filter((r) => !r.ok && isRequired(r)).map((r) => r.kind),
    optionalMissing: results.filter((r) => !r.ok && !isRequired(r)).map((r) => r.kind),
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
  const id = `${name} (${setCode.toUpperCase()})`;
  const plural = (kinds) => `dataset${kinds.length > 1 ? "s" : ""}`;

  if (report.available) {
    const sizes = report.present.map((r) => `${r.kind} ${mb(r.bytes)}`).join(", ");
    const note = report.optionalMissing?.length
      ? ` (no ${report.optionalMissing.join(", ")} ${plural(report.optionalMissing)}, which we don't read yet)`
      : "";
    return `${id} is available for ${format}: ${sizes}${note}`;
  }
  return (
    `${id} isn't available for ${format} — ` +
    `missing ${report.missing.join(", ")} ${plural(report.missing)}. ` +
    `A set is ingested when 17Lands publishes ${USED_KINDS.join(" and ")} for it.`
  );
}
