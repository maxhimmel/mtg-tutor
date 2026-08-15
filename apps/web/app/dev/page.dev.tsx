import { Suspense } from "react";
import { Playground } from "./Playground";

// A workbench, not a screen anyone is meant to find. It exists because the only
// way to see what a component does with an awkward card used to be to draft
// until that card turned up: the placard's ten-pip overflow was found in a real
// draft, by luck, after shipping.
//
// `.dev.tsx` is what keeps it out of production, and there is deliberately no
// runtime check beside it -- see `pageExtensions` in next.config.ts. A build
// does not treat this file as a page, so the route is absent rather than
// guarded, and the whole-pool read it makes never ships at all.
export default function DevPlaygroundPage() {
  // The stage keeps its card and set in the query string, which useSearchParams
  // reads -- and that suspends on the first render of a page that is otherwise
  // static.
  return (
    <Suspense>
      <Playground />
    </Suspense>
  );
}
