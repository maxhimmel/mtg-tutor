import { PRINCIPLE_ICONS } from "../lib/principleIcons";

// The mark for a principle's category. Always decorative: everywhere this is
// drawn, the category is also said in words or is one hover away, because a
// silhouette nobody has been taught is not a label.
//
// Nothing when the category has no mark, rather than a placeholder. The id
// beside it still says which category it is, so an unmarked citation is quieter
// than the others and not broken -- and principleIcons.test.ts is what makes
// sure nobody has to notice.
export function PrincipleIcon({ category, className }: { category: string; className?: string }) {
  const paths = PRINCIPLE_ICONS[category];
  if (!paths) return null;

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
