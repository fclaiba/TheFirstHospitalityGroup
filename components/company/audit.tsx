"use client";

import { useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery, useNow } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { dateShort, time } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { List, PageHeader, Row } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";

const ENTITIES = [
  "users",
  "venues",
  "companies",
  "scheduleWeeks",
  "shiftsPlanned",
  "swaps",
  "timeOff",
  "venueEvents",
  "shifts",
  "closeReports",
  "warnings",
  "warningProposals",
  "ruleSets",
  "menuItems",
  "shortages",
  "messages",
  "positionHistory",
  "tipPolicies",
  "imports",
  "chainOverrides",
] as const;

const SINCE = { "1": 1, "7": 7, "30": 30, all: 0 } as const;
type Since = keyof typeof SINCE;
const DAY = 24 * 3600_000;

/** The audit log for the owner (BLUEPRINT 10): newest first, by what and since when. */
export function AuditLog() {
  const { t, locale } = useLocale();
  const now = useNow(60_000);
  const [entity, setEntity] = useState<string>("");
  const [since, setSince] = useState<Since>("7");
  const [limit, setLimit] = useState(50);
  // Round to the minute so the query args stay stable between renders.
  const from = SINCE[since] ? Math.floor((now - SINCE[since] * DAY) / 60_000) * 60_000 : undefined;
  const rows = useQuery(api.audit.list, { entity: entity || undefined, from, limit });
  const entityLabel = (e: string) => ((ENTITIES as readonly string[]).includes(e) ? t(`company.audit.entities.${e}`) : e);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("company.audit.title")} subtitle={t("company.audit.intro")} back="/company/setup" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("company.audit.entity")}>
          {(p) => (
            <Select {...p} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">{t("company.audit.allEntities")}</option>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {entityLabel(e)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("company.audit.since")}>
          {(p) => (
            <Select {...p} value={since} onChange={(e) => setSince(e.target.value as Since)}>
              <option value="1">{t("company.audit.since1")}</option>
              <option value="7">{t("company.audit.since7")}</option>
              <option value="30">{t("company.audit.since30")}</option>
              <option value="all">{t("company.audit.sinceAll")}</option>
            </Select>
          )}
        </Field>
      </div>
      {rows === undefined ? (
        <ScreenSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClockCounterClockwise weight="bold" />} title={t("company.audit.empty")} />
      ) : (
        <>
          <List>
            {rows.map((r) => (
              <Row
                key={r._id}
                title={<span className="font-mono text-small">{r.action}</span>}
                subtitle={[r.actor ?? t("company.audit.system"), entityLabel(r.entity), r.venue].filter(Boolean).join(" · ")}
                trailing={
                  <span className="text-right font-mono text-caption tabular">
                    {dateShort(locale, r.at)}
                    <br />
                    {time(locale, r.at)}
                  </span>
                }
              />
            ))}
          </List>
          {rows.length >= limit && limit < 200 ? (
            <Button variant="secondary" size="md" className="self-center" onClick={() => setLimit(Math.min(200, limit + 50))}>
              {t("company.audit.more")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
