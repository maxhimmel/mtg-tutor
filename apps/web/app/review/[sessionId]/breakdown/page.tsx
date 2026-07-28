import { ReviewBreakdown } from "./ReviewBreakdown";

export default async function BreakdownPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReviewBreakdown sessionId={sessionId} />;
}
