import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Playground } from "./Playground";

// A workbench, not a screen anyone is meant to find. It exists because the only
// way to see what a component does with an awkward card used to be to draft
// until that card turned up: the placard's ten-pip overflow was found in a real
// draft, by luck, after shipping.
//
// The gate is a 404 rather than a build-time exclusion so the route behaves in
// production exactly as a route that does not exist -- and so the fat set read
// below can never be reached by anybody but whoever is running the dev server.
export default function DevPlaygroundPage() {
  if (process.env.NODE_ENV === "production") notFound();

  // The stage keeps its card and set in the query string, which useSearchParams
  // reads -- and that suspends on the first render of a page that is otherwise
  // static.
  return (
    <Suspense>
      <Playground />
    </Suspense>
  );
}
