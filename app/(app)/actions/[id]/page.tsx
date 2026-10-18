"use client";
import { useParams } from "next/navigation";
import { ActionDetailScreen } from "@/components/actions/screens";
import type { Id } from "@/convex/_generated/dataModel";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ActionDetailScreen actionId={decodeURIComponent(id) as Id<"operatingActions">} />;
}
