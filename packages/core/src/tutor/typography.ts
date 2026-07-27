// The model does not type the characters it was given. It reaches for
// typographic hyphens mid-word ("2‑drop") and curly apostrophes, so anything
// matching its output against something we know the spelling of -- a principle
// id, a card name -- has to accept every variant of the same mark.
//
// Both are character-class bodies, ready to drop inside `[...]`. The hyphen list
// leads with the ASCII one, which is literal in that position.

export const HYPHEN_CLASS = "-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212";
export const APOSTROPHE_CLASS = "'\\u2018\\u2019\\u02bc";

export const ANY_HYPHEN = new RegExp(`[${HYPHEN_CLASS}]`, "g");
export const ANY_APOSTROPHE = new RegExp(`[${APOSTROPHE_CLASS}]`, "g");
