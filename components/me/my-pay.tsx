"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { money, dateKeyLabel } from "@/lib/format";
import { Section } from "@/components/ui/layout";
import { AdjustmentCard } from "@/components/pay/adjustment-card";

/** My pay (ADR 0017): my rate and the adjustments switched ON for me. Hidden when there is nothing recorded. */
export function MyPay() {
  const { t, locale } = useLocale();
  const data = useQuery(api.pay.mine, {});
  if (!data || (!data.current && data.adjustments.length === 0)) return null;
  return (
    <Section title={t("me.pay")}>
      {data.current ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-raised p-4">
          <div>
            <p className="text-small text-ink-muted">{t(`pay.type.${data.current.type}`)}</p>
            <p className="text-small text-ink-muted">{t("pay.since", { date: dateKeyLabel(locale, data.current.effectiveFrom) })}</p>
          </div>
          <p className="font-mono text-title-sm font-semibold text-ink tabular">
            {money(locale, data.current.rateCents)}
            <span className="text-small font-normal text-ink-muted">{data.current.type === "hourly" ? t("pay.perHour") : t("pay.perYear")}</span>
          </p>
        </div>
      ) : null}
      {data.adjustments.length ? (
        <ul className="flex flex-col gap-3">
          {data.adjustments.map((a) => (
            <li key={a._id}>
              <AdjustmentCard a={a} showPerson={false} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="px-1 text-small text-ink-muted">{t("pay.reference")}</p>
    </Section>
  );
}
