"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { REPORTS_TO } from "@/lib/domain/chain";
import { POSITIONS } from "@/lib/domain/types";
import type { Position } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ButtonRow, List, PageHeader, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { ScreenSkeleton } from "@/components/ui/states";
import { useCompanyVenue, VenuePicker } from "./venue-picker";
import { AREAS } from "@/lib/domain/types";
import { areaOf } from "@/lib/domain/positions";

type Edit = { position: Position; en: string; es: string; reportsTo: Position | "" };

/** Local names per venue and who each position reports to (BLUEPRINT 2.1, ADR 0026). */
export function PositionsSetup() {
  const { t, locale } = useLocale();
  const search = useSearchParams();
  const { venueId: current, setVenueId, venues } = useCompanyVenue();
  const fromLink = search.get("venue") as Id<"venues"> | null;
  const [picked, setPicked] = useState<Id<"venues"> | null>(fromLink && venues.some((v) => v.id === fromLink) ? fromLink : null);
  const venueId = picked ?? current;
  const all = useQuery(api.org.allVenues, {});
  const overrides = useQuery(api.org.chainOverrides, venueId ? { venueId } : "skip");
  const [edit, setEdit] = useState<Edit | null>(null);

  const venue = all?.find((v) => v._id === venueId) ?? null;
  if (!venueId || all === undefined || overrides === undefined) return <ScreenSkeleton rows={6} />;

  const localOf = (p: Position) => venue?.localNames.find((l) => l.position === p)?.name ?? null;
  const overrideOf = (p: Position) => (overrides.find((o) => o.position === p)?.reportsTo as Position | undefined) ?? null;
  const label = (p: Position) => {
    const l = localOf(p);
    return l ? pickLocalized(l, locale) : t(`positions.${p}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("company.positionsPage.title")} subtitle={t("company.positionsPage.intro")} back="/company/setup" />
      <VenuePicker
        value={venueId}
        onChange={(id) => {
          setPicked(id);
          setVenueId(id);
        }}
        venues={venues}
        label={t("company.positionsPage.venue")}
      />
      {venue
        ? AREAS.filter((a) => a !== "corporate").map((a) => {
            const used = venue.positionsUsed.filter((p) => areaOf(p as Position) === a) as Position[];
            if (!used.length) return null;
            return (
              <Section key={a} title={t(`areas.${a}`)}>
                <List>
                  {used.map((p) => {
                    const o = overrideOf(p);
                    const to = o ?? REPORTS_TO[p];
                    return (
                      <ButtonRow
                        key={p}
                        onClick={() => {
                          const l = localOf(p);
                          setEdit({ position: p, en: l?.en ?? "", es: l?.es ?? "", reportsTo: o ?? "" });
                        }}
                        title={label(p)}
                        subtitle={to ? t("company.org.reportsTo", { position: label(to) }) : t("company.org.top")}
                        trailing={o ? <StatusChip tone="info" size="sm" icon={false}>{t("company.positionsPage.overridden")}</StatusChip> : undefined}
                      />
                    );
                  })}
                </List>
              </Section>
            );
          })
        : null}
      {edit && venue ? <PositionSheet key={edit.position} venue={venue} initial={edit} label={label} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function PositionSheet({ venue, initial, label, onClose }: { venue: Doc<"venues">; initial: Edit; label: (p: Position) => string; onClose: () => void }) {
  const { t } = useLocale();
  const [e, setE] = useState(initial);
  const saveVenue = useRun(api.org.upsertVenue);
  const saveChain = useRun(api.org.setChainOverride);
  const busy = saveVenue.busy || saveChain.busy;
  const p = e.position;
  const def = REPORTS_TO[p];
  const choices = POSITIONS.filter((x) => x !== "dev" && x !== p && (venue.positionsUsed.includes(x) || x === "director" || x === "owner"));

  const save = async () => {
    const others = venue.localNames.filter((l) => l.position !== p);
    const localNames = e.en.trim() && e.es.trim() ? [...others, { position: p, name: { en: e.en.trim(), es: e.es.trim() } }] : others;
    const changedName = JSON.stringify(localNames) !== JSON.stringify(venue.localNames);
    if (changedName) {
      const r = await saveVenue.run({
        venueId: venue._id,
        name: venue.name,
        slug: venue.slug,
        address: venue.address,
        services: venue.services,
        positionsUsed: venue.positionsUsed,
        localNames,
        reservationsUrl: venue.reservationsUrl,
        active: venue.active,
      });
      if (!r) return;
    }
    if (e.reportsTo !== initial.reportsTo) {
      const r = await saveChain.run({ venueId: venue._id, position: p, reportsTo: e.reportsTo || null });
      if (!r) return;
    }
    onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("company.positionsPage.edit", { position: t(`positions.${p}`) })}
      footer={
        <Button block loading={busy} onClick={() => void save()}>
          {t("company.positionsPage.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <Section title={t("company.positionsPage.localName")}>
          <p className="px-1 text-small text-ink-muted">{t("company.positionsPage.localNameHelp")}</p>
          <Field label={t("company.positionsPage.nameEn")}>{(f) => <Input {...f} value={e.en} maxLength={30} onChange={(x) => setE({ ...e, en: x.target.value })} />}</Field>
          <Field label={t("company.positionsPage.nameEs")}>{(f) => <Input {...f} value={e.es} maxLength={30} onChange={(x) => setE({ ...e, es: x.target.value })} />}</Field>
        </Section>
        <Field label={t("company.positionsPage.reportsTo")} help={def ? t("company.positionsPage.default", { position: label(def) }) : undefined}>
          {(f) => (
            <Select {...f} value={e.reportsTo} onChange={(x) => setE({ ...e, reportsTo: x.target.value as Position | "" })}>
              <option value="">{t("company.positionsPage.useDefault")}</option>
              {choices.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
