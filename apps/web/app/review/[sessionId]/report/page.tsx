import { ReviewReport } from "./ReviewReport";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReviewReport sessionId={sessionId} />;
}
