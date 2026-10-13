"use client";

import { useState } from "react";
import { ClockCounterClockwise, Gauge, Plus, Storefront } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { ago, clock } from "@/lib/format";
import { hasKey } from "@/lib/i18n";
import { SERVICES } from "@/lib/domain/types";
import type { Service } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, SwitchRow } from "@/components/ui/field";
import { ButtonRow, Card, LinkRow, List, PageHeader, Row, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

const TIME = /^\d{1,2}:\d{2}$/;

/** Company, venues and their services, links to thresholds and the audit log (BLUEPRINT 6.1 /owner/settings). */
export function OwnerSettings() {
  const { t } = useLocale();
  const company = useQuery(api.org.company, {});
  const venues = useQuery(api.org.allVenues, {});
  const setCompany = useRun(api.org.setCompany, { success: t("common.saved") });
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState<Doc<"venues"> | "new" | null>(null);
  if (company === undefined || venues === undefined) return <ScreenSkeleton rows={5} />;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={t("owner.settings.title")} subtitle={t("owner.settings.subtitle")} />
      <Section title={t("owner.settings.company")}>
        <Card className="flex flex-col gap-4">
          <Field label={t("owner.settings.companyName")}>
            {(p) => <Input {...p} value={name ?? company.name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Button variant="secondary" size="md" className="self-start" loading={setCompany.busy} disabled={name === null || !name.trim() || name === company.name} onClick={() => void setCompany.run({ name: (name ?? "").trim() })}>
            {t("common.save")}
          </Button>
          <div className="border-t border-line pt-2">
            <SwitchRow
              label={t("owner.settings.captainComps")}
              help={t("owner.settings.captainCompsHelp")}
              checked={company.captainApprovesComps}
              disabled={setCompany.busy}
              onChange={(v) => void setCompany.run({ captainApprovesComps: v })}
            />
          </div>
        </Card>
      </Section>

      <Section title={t("owner.settings.venues")}>
        <List>
          {[...venues]
            .sort((a, b) => a.sort - b.sort)
            .map((v) => (
              <ButtonRow
                key={v._id}
                onClick={() => setEditing(v)}
                leading={<Storefront weight="bold" className="size-5" />}
                title={v.name}
                subtitle={v.services.map((s) => t("owner.settings.serviceRange", { service: t(`services.${s.key}`), start: clock(s.startsAt), end: clock(s.endsAt) })).join(" · ")}
                trailing={
                  v.active ? null : (
                    <StatusChip tone="neutral" size="sm">
                      {t("owner.settings.inactive")}
                    </StatusChip>
                  )
                }
              />
            ))}
          <ButtonRow onClick={() => setEditing("new")} leading={<Plus weight="bold" className="size-5 text-brand" />} title={t("owner.settings.addVenue")} />
        </List>
      </Section>

      <Section title={t("owner.settings.more")}>
        <List>
          <LinkRow href="/owner/settings/thresholds" leading={<Gauge weight="bold" className="size-5" />} title={t("owner.settings.thresholds")} subtitle={t("owner.settings.thresholdsHelp")} />
          <LinkRow href="/owner/settings/audit" leading={<ClockCounterClockwise weight="bold" className="size-5" />} title={t("nav.audit")} subtitle={t("owner.settings.auditHelp")} />
        </List>
      </Section>
      {editing ? <VenueSheet venue={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

type ServiceRow = { key: Service; on: boolean; startsAt: string; endsAt: string };

function VenueSheet({ venue, onClose }: { venue: Doc<"venues"> | null; onClose: () => void }) {
  const { t } = useLocale();
  const save = useRun(api.org.setVenue, { success: t("common.saved") });
  const [name, setName] = useState(venue?.name ?? "");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [active, setActive] = useState(venue?.active ?? true);
  const [rows, setRows] = useState<ServiceRow[]>(
    SERVICES.map((key) => {
      const s = venue?.services.find((x) => x.key === key);
      return { key, on: !!s, startsAt: s?.startsAt ?? (key === "lunch" ? "11:30" : key === "dinner" ? "17:00" : "23:00"), endsAt: s?.endsAt ?? (key === "lunch" ? "15:00" : key === "dinner" ? "23:00" : "02:00") };
    }),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async () => {
    const services = rows.filter((r) => r.on).map(({ key, startsAt, endsAt }) => ({ key, startsAt, endsAt }));
    if (!name.trim()) return setProblem(t("owner.settings.nameRequired"));
    if (!services.length) return setProblem(t("owner.settings.serviceRequired"));
    if (services.some((s) => !TIME.test(s.startsAt) || !TIME.test(s.endsAt))) return setProblem(t("owner.settings.timeFormat"));
    setProblem(null);
    const r = await save.run({ venueId: venue?._id as Id<"venues"> | undefined, name: name.trim(), address: address.trim() || undefined, services, active });
    if (r) onClose();
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={venue ? venue.name : t("owner.settings.addVenue")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("common.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label={t("owner.settings.venueName")}>{(p) => <Input {...p} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t("owner.settings.address")} optional={t("common.optional")}>
          {(p) => <Input {...p} value={address} maxLength={120} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-semibold text-ink">{t("owner.settings.services")}</legend>
          <p className="text-small text-ink-muted">{t("owner.settings.servicesHelp")}</p>
          {rows.map((r, i) => (
            <div key={r.key} className="flex flex-col gap-2 rounded-card border border-line p-3">
              <SwitchRow label={t(`services.${r.key}`)} checked={r.on} onChange={(on) => setRows(rows.map((x, j) => (j === i ? { ...x, on } : x)))} />
              {r.on ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("owner.settings.starts")}>
                    {(p) => <Input {...p} inputMode="numeric" className="font-mono" value={r.startsAt} maxLength={5} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, startsAt: e.target.value } : x)))} />}
                  </Field>
                  <Field label={t("owner.settings.ends")}>
                    {(p) => <Input {...p} inputMode="numeric" className="font-mono" value={r.endsAt} maxLength={5} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, endsAt: e.target.value } : x)))} />}
                  </Field>
                </div>
              ) : null}
            </div>
          ))}
        </fieldset>
        <SwitchRow label={t("owner.settings.active")} help={t("owner.settings.activeHelp")} checked={active} onChange={setActive} />
        <InlineError>{problem}</InlineError>
      </div>
    </Sheet>
  );
}

const ENTITIES = ["shifts", "users", "warnings", "requests", "payAdjustments", "payRecords", "menuItems", "stockMoves", "ruleSets", "messages", "companies", "venues"] as const;
const WINDOWS = [
  { key: "1", days: 1 },
  { key: "7", days: 7 },
  { key: "30", days: 30 },
  { key: "all", days: 0 },
] as const;

/** Owner audit log (BLUEPRINT 10): who did what and when, newest first. */
export function AuditLog() {
  const { t, locale } = useLocale();
  const label = (key: string, raw: string) => (hasKey(locale, key) ? t(key) : raw);
  const [entity, setEntity] = useState<string>("");
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("7");
  const [limit, setLimit] = useState(50);
  const [from] = useState(() => Date.now());
  const days = WINDOWS.find((w) => w.key === win)!.days;
  const rows = useQuery(api.audit.list, { entity: entity || undefined, from: days ? from - days * 86_400_000 : undefined, limit });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/owner/settings" title={t("nav.audit")} subtitle={t("audit.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("audit.entity")}>
          {(p) => (
            <Select {...p} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">{t("common.all")}</option>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {t(`audit.entities.${e}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("audit.window")}>
          {(p) => (
            <Select {...p} value={win} onChange={(e) => setWin(e.target.value as typeof win)}>
              {WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>
                  {t(`audit.windows.${w.key}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {rows === undefined ? (
        <ScreenSkeleton rows={6} />
      ) : rows.length ? (
        <>
          <List>
            {rows.map((r) => (
              <Row
                key={r._id}
                title={label(`audit.actions.${r.action.replace(".", "_")}`, r.action)}
                subtitle={[r.actor ?? t("audit.system"), r.venue, ago(t, r.at)].filter(Boolean).join(" · ")}
                trailing={<span className="font-mono text-caption text-ink-subtle">{label(`audit.entities.${r.entity}`, r.entity)}</span>}
              />
            ))}
          </List>
          {rows.length >= limit && limit < 200 ? (
            <Button variant="secondary" size="md" className="self-center" onClick={() => setLimit(Math.min(200, limit + 50))}>
              {t("common.showMore")}
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyState title={t("audit.none")} />
      )}
    </div>
  );
}
