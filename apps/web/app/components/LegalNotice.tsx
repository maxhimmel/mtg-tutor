// The attribution the Fan Content Policy asks for, and the two sources the app
// is built out of.
//
// WHY THE FIRST SENTENCE IS COPIED RATHER THAN WRITTEN
//
// Everything else in this app is said in our own words. This is the exception:
// the Fan Content Policy gives the notice as a literal quotation to include, and
// a paraphrase of a permission notice is a different notice. It is the one thing
// the policy states in exact words, so it is the one string here nobody should
// improve. Only the bracketed title is ours to fill in.
//
// It is owed for the card data, which we have been shipping since the first
// draft: names, type lines, rules text and art are Wizards' material, and
// Scryfall passes them on under this same policy. The app carried no notice at
// all until now, which is the gap this closes.
//
// WHY SCRYFALL AND 17LANDS ARE NAMED HERE AND NOT ONLY IN THE PROSE
//
// 17Lands is named all over the UI already -- the hover panel, the settings
// copy, the set list column -- because whose data a number is decides how much
// to trust it. Scryfall was named nowhere a person could see, despite every card
// on every screen coming from it. Both get a line, and Scryfall gets the wording
// its own terms ask for: a credit, not a claim of endorsement.
//
// Plain text rather than a logo for the same reason -- Scryfall's terms say
// their name may not be used in a way that implies they endorsed this.
export function LegalNotice() {
  return (
    <footer className="mt-16 border-t border-base-content/10 pt-6 text-xs leading-relaxed text-base-content/50">
      <p>
        P1P1 is unofficial Fan Content permitted under the Fan Content Policy. Not
        approved/endorsed by Wizards. Portions of the materials used are property of Wizards of
        the Coast. ©Wizards of the Coast LLC.
      </p>
      <p className="mt-2">
        Card data and images from{" "}
        <a
          href="https://scryfall.com"
          target="_blank"
          rel="noreferrer"
          className="link link-hover"
        >
          Scryfall
        </a>
        . Draft and win-rate data from{" "}
        <a
          href="https://www.17lands.com"
          target="_blank"
          rel="noreferrer"
          className="link link-hover"
        >
          17Lands
        </a>
        . Neither has endorsed this app.
      </p>
    </footer>
  );
}
