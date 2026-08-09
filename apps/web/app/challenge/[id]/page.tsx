import { ChallengeLanding } from "./ChallengeLanding";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeLanding challengeId={id} />;
}
