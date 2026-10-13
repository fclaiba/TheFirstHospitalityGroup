"use client";

import { Info } from "@phosphor-icons/react";
import { useLocale } from "@/lib/i18n-client";
import { AREAS, LAYERS } from "@/lib/domain/types";
import { layerOf, positionsIn } from "@/lib/domain/positions";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { StatusChip } from "@/components/ui/status";

/** Read-only: the seven areas and the five layers are part of the product (BLUEPRINT 2.1, ADR 0020). */
export function AreasPage() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("company.areasPage.title")} subtitle={t("company.areasPage.intro")} back="/company/setup" />
      <p className="flex items-start gap-2 rounded-card bg-info-bg px-4 py-3 text-body text-info-fg">
        <Info weight="fill" aria-hidden className="mt-0.5 size-5 shrink-0" />
        {t("company.areasPage.fixed")}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {AREAS.map((a) => {
          const positions = positionsIn(a);
          const lead = positions.find((p) => layerOf(p) === "lead") ?? positions.find((p) => layerOf(p) === "manager") ?? positions[positions.length - 1];
          return (
            <Card key={a} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-title-sm font-bold text-ink">{t(`areas.${a}`)}</h2>
                {lead ? <p className="text-small text-ink-muted">{t("company.areasPage.areaLead", { position: t(`positions.${lead}`) })}</p> : null}
              </div>
              <ol className="flex flex-col gap-1.5">
                {positions.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-3 text-body text-ink">
                    <span>{t(`positions.${p}`)}</span>
                    <StatusChip tone="neutral" size="sm" icon={false}>
                      {t(`layers.${layerOf(p)}`)}
                    </StatusChip>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>
      <Section title={t("company.areasPage.layersTitle")}>
        <Card className="flex flex-col gap-3">
          {LAYERS.map((l) => (
            <div key={l} className="flex flex-col gap-0.5">
              <span className="text-body font-semibold text-ink">{t(`layers.${l}`)}</span>
              <span className="text-small text-ink-muted">{t(`company.areasPage.layerHelp.${l}`)}</span>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}
