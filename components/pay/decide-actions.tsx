"use client";

import { Check, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { Button, ConfirmButton } from "@/components/ui/button";

/** Switch ON or reject a proposal (ADR 0017). Rejecting is the two-tap action. */
export function DecideActions({ adjustmentId }: { adjustmentId: string }) {
  const { t } = useLocale();
  const on = useRun(api.pay.switchOn, { success: t("pay.switchedOn") });
  const reject = useRun(api.pay.reject, { success: t("pay.rejected") });
  const id = adjustmentId as Id<"payAdjustments">;
  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-3">
      <Button size="md" loading={on.busy} icon={<Check weight="bold" className="size-5" />} onClick={() => void on.run({ adjustmentId: id })}>
        {t("pay.switchOn")}
      </Button>
      <ConfirmButton size="md" confirmLabel={t("pay.rejectConfirm")} icon={<X weight="bold" className="size-5" />} loading={reject.busy} onConfirm={() => void reject.run({ adjustmentId: id })}>
        {t("pay.reject")}
      </ConfirmButton>
    </div>
  );
}
