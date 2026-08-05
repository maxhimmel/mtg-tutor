import { ReviewDeck } from "./ReviewDeck";

export default async function DeckPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReviewDeck sessionId={sessionId} />;
}
