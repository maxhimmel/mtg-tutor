import { DraftBoard } from "./DraftBoard";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <DraftBoard sessionId={sessionId} />;
}
