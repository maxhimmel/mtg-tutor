// The two sentences the feedback path refuses with.
//
// Here rather than beside the mutation, which is where quota.ts keeps its own
// refusals, and the difference is what the clients do with them. A quota refusal
// is only ever rendered, so the server owning the wording is enough. These two
// are also BRANCHED on: the browser reports which refusal it hit, and "my daily
// cap stopped a friend mid-sentence" is a different answer to "the app broke".
//
// Matching the prose to work that out is the mistake the root CLAUDE.md names
// for access_blocked -- the wording is a product decision and would take the
// metric with it the day it changes. Comparing against the string the server
// actually threw makes the branch exact, and puts the rename in one place.

export const FEEDBACK_TOO_MUCH =
  "That is a lot of feedback for one day -- thank you. Send the rest tomorrow.";

export const FEEDBACK_SAY_SOMETHING = "Say something, or pick a thumb.";
