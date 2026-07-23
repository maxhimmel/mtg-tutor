// Reports whether a set's full 17Lands public dataset exists for a format,
// without downloading anything. A fast preflight before ingesting, and the basis
// for scanning many sets later.
//
//   node scripts/check-set-availability.mjs TDM TradDraft
//
// Exits 0 when every dataset is present, 1 when any is missing -- so it can gate
// a shell pipeline.

import { checkAvailability, availabilityNote } from "./lib/datasets.mjs";

const [setArg, formatArg] = process.argv.slice(2);
if (!setArg) {
  console.error("usage: check-set-availability.mjs <setCode> [format]");
  process.exit(1);
}
const setCode = setArg.toLowerCase();
const format = formatArg ?? "PremierDraft";

const report = await checkAvailability(setCode, format);
console.log(await availabilityNote(setCode, format, report));
process.exit(report.available ? 0 : 1);
