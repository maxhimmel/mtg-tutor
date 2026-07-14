import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadSetData, ratedCardCount } from "../../core/data/setdata.js";
import { fetchSetCatalog } from "../../core/data/sets.js";
import { pickSet } from "../../core/ui/setPicker.js";
import { runDraft } from "./screen.js";

// Draft service entrypoint. `argv` is [setCode?, format?]; with no set code we
// fall back to the searchable set picker.
export async function run(argv: string[]): Promise<void> {
  const [setArg, fmtArg] = argv;
  const format = fmtArg ?? "PremierDraft";
  let setCode = setArg;

  if (!setCode) {
    const cat = p.spinner();
    cat.start("Loading set list");
    let catalog;
    try {
      catalog = await fetchSetCatalog();
    } catch (e) {
      cat.stop(pc.red("Failed to load set list"));
      p.log.error(e instanceof Error ? e.message : String(e));
      return;
    }
    cat.stop(`${catalog.length} draftable sets available`);

    const chosen = await pickSet(catalog);
    if (!chosen) {
      p.cancel("No set chosen.");
      return;
    }
    setCode = chosen.code;
  }

  const s = p.spinner();
  s.start(`Loading ${setCode.toUpperCase()} card + 17Lands data`);
  let set;
  try {
    set = await loadSetData(setCode, format);
  } catch (e) {
    s.stop(pc.red(`Failed to load "${setCode}"`));
    p.log.error(e instanceof Error ? e.message : String(e));
    return;
  }
  const rated = ratedCardCount(set);
  s.stop(`Loaded ${set.code.toUpperCase()}: ${set.cards.length} cards, ${rated} with 17Lands data`);

  if (rated < 20) {
    p.log.warn(
      `Only ${rated} cards have 17Lands data for this set — scoring will lean on rarity fallbacks. ` +
        `Try a set with more Premier Draft play.`,
    );
  }
  await runDraft(set, format);
}
