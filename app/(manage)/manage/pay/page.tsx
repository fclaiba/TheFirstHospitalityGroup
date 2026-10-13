"use client";

import { useState } from "react";
import { HandCoins, Plus } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { useMe } from "@/hooks/use-app";
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { AdjustmentCard } from "@/components/pay/adjustment-card";
import { DecideActions } from "@/components/pay/decide-actions";
import { ProposeSheet } from "@/components/pay/propose-sheet";

/** Pay proposals (ADR 0017, P3): captains and managers propose; managers switch ON their captains' proposals. */
function ManagePay() {
  const { t } = useLocale();
  const me = useMe();
  const isManager = me?.role === "manager" || me?.role === "owner" || me?.role === "dev";
  const pending = useQuery(api.pay.pending, isManager ? {} : "skip");
  const mine = useQuery(api.pay.proposedByMe, {});
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title={t("pay.manageTitle")}
        subtitle={t("pay.manageSubtitle")}
        action={
          <Button size="md" icon={<Plus weight="bold" className="size-5" />} onClick={() => setOpen(true)}>
            {t("pay.propose")}
          </Button>
        }
      />
      <div className="flex flex-col gap-8">
        {isManager ? (
          <Section title={t("pay.toApprove")}>
            {pending === undefined ? (
              <ScreenSkeleton rows={2} />
            ) : pending.length === 0 ? (
              <p className="px-1 text-body text-ink-muted">{t("pay.nothingToApprove")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pending.map((a) => (
                  <li key={a._id}>
                    <AdjustmentCard a={a} actions={<DecideActions adjustmentId={a._id} />} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
        <Section title={t("pay.myProposals")}>
          {mine === undefined ? (
            <ScreenSkeleton rows={2} />
          ) : mine.length === 0 ? (
            <EmptyState icon={<HandCoins weight="bold" />} title={t("pay.emptyTitle")} body={t("pay.emptyBody")} />
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.map((a) => (
                <li key={a._id}>
                  <AdjustmentCard a={a} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <p className="px-1 text-small text-ink-muted">{t("pay.noDeductions")}</p>
      </div>
      <ProposeSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="pay.propose">
      <ManagePay />
    </RequireAuth>
  );
}
