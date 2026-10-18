import { ActionsScreen } from "@/components/actions/screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const p = await searchParams;
  return <ActionsScreen explicitVenue={p.venue} />;
}
