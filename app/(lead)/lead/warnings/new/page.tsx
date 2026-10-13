"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { useVenue } from "@/hooks/use-app";
import { dateShort } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import { RequireAuth } from "@/components/app/require-auth";
import { List, Row, Section } from "@/components/ui/layout";
import { ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { WarningForm } from "@/components/warnings/warning-form";

/** What I proposed and what the manager decided (ADR 0026: leads propose, managers issue). */
function MyProposals() {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const list = useQuery(api.warnings.myProposals, venueId ? { venueId } : "skip");
  if (list === undefined) return <ScreenSkeleton rows={2} />;
  if (!list.length) return null;
  return (
    <Section title={t("warnings.myProposals")} className="mt-10">
      <List>
        {list.map((p) => (
          <Row
            key={p._id}
            title={p.personName}
            subtitle={`${p.rule ? pickLocalized(p.rule.title, locale) : t("warnings.ruleRemoved")}, ${dateShort(locale, p.at)}`}
            trailing={
              p.status === "issued" ? (
                <StatusChip tone="ok" size="sm">{t("warnings.statusIssued")}</StatusChip>
              ) : p.status === "discarded" ? (
                <StatusChip tone="neutral" size="sm">{t("warnings.statusDiscarded")}</StatusChip>
              ) : (
                <StatusChip tone="attention" size="sm">{p.escalated ? t("warnings.statusEscalated") : t("warnings.statusWaiting")}</StatusChip>
              )
            }
          />
        ))}
      </List>
    </Section>
  );
}

function Propose() {
  const params = useSearchParams();
  return (
    <>
      <WarningForm mode="propose" back="/today" initialUserId={params.get("userId") ?? undefined} initialRuleKey={params.get("rule") ?? undefined} />
      <MyProposals />
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="warnings.propose">
      <Suspense fallback={<ScreenSkeleton />}>
        <Propose />
      </Suspense>
    </RequireAuth>
  );
}
