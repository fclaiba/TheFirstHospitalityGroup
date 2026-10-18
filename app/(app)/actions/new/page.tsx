import { NewActionScreen } from "@/components/actions/screens";
import { RequireAuth } from "@/components/app/require-auth";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    venue?: string;
    sourceShift?: string;
    item?: string;
  }>;
}) {
  const p = await searchParams;
  return (
    <RequireAuth action="actions.manage">
      <NewActionScreen
        explicitVenue={p.venue}
        sourceShiftId={p.sourceShift}
        sourceItem={p.item}
      />
    </RequireAuth>
  );
}
