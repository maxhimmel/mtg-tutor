import { notFound } from "next/navigation";
import { TrackLab } from "./TrackLab";

// Dev only, and gated at the route rather than left to a convention: this is a
// scratch surface for choosing between six drafts of the pick track, and it has
// no business existing in a deployment. A push to main is a production deploy,
// so the gate has to be the code rather than a note to remember.
export default function TrackLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TrackLab />;
}
