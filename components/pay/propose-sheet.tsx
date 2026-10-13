"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useVenue } from "@/hooks/use-app";
import { parseCents } from "@/lib/format";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineError } from "@/components/ui/states";

type Kind = "bonus" | "award" | "correction";

/** Propose an adjustment (ADR 0017): positive amounts only; the approver above switches it ON. */
export function ProposeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLocale();
  const { venueId } = useVenue();
  const people = useQuery(api.pay.eligible, venueId && open ? { venueId } : "skip");
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<Kind>("award");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const propose = useRun(api.pay.propose, { success: t("pay.proposed"), silent: true });
  const cents = parseCents(amount);
  const ready = !!userId && !!cents && cents > 0 && !!reason.trim();

  const submit = async () => {
    if (!venueId || !cents) return;
    const r = await propose.run({ userId: userId as Id<"users">, venueId, kind, amountCents: cents, reason: reason.trim() });
    if (r) {
      setUserId("");
      setAmount("");
      setReason("");
      onOpenChange(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("pay.proposeTitle")}
      description={t("pay.proposeBody")}
      footer={
        <Button block disabled={!ready} loading={propose.busy} onClick={() => void submit()}>
          {t("pay.proposeSend")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label={t("pay.person")}>
          {(p) => (
            <Select {...p} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t("pay.choosePerson")}</option>
              {(people ?? []).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}, {t(`roles.${u.role}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-small font-semibold text-ink">{t("pay.kindLabel")}</p>
          <ChoicePills<Kind>
            label={t("pay.kindLabel")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "award", label: t("pay.kind.award") },
              { value: "bonus", label: t("pay.kind.bonus") },
              { value: "correction", label: t("pay.kind.correction") },
            ]}
          />
        </div>
        <Field label={t("pay.amount")} help={t("pay.amountHelp")}>
          {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" className="font-mono tabular" />}
        </Field>
        <Field label={t("pay.reason")} help={t("pay.reasonHelp")}>
          {(p) => <Textarea {...p} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <InlineError>{propose.message}</InlineError>
        <p className="text-small text-ink-muted">{t("pay.noDeductions")}</p>
      </div>
    </Sheet>
  );
}
