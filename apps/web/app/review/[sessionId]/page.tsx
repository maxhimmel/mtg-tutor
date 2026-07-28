import { ReviewWalkthrough } from "./ReviewWalkthrough";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReviewWalkthrough sessionId={sessionId} />;
}
