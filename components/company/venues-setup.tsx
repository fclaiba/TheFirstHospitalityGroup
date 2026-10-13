"use client";

import { useState } from "react";
import { Buildings, Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { clock } from "@/lib/format";
import { venueInput } from "@/schemas";
import { AREAS, SERVICES } from "@/lib/domain/types";
import type { Position, Service } from "@/lib/domain/types";
import { positionsIn } from "@/lib/domain/positions";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, SwitchRow } from "@/components/ui/field";
import { LinkRow, List, PageHeader, Section, ButtonRow } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/status";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { ToggleChips, weekdayNames } from "./toggle-chips";

type ServiceDraft = { key: Service; weekdays: number[]; startsAt: string; endsAt: string; preShiftMin: number };
type Draft = {
  venueId?: Id<"venues">;
  name: string;
  slug: string;
  address: string;
  reservationsUrl: string;
  active: boolean;
  services: ServiceDraft[];
  positionsUsed: Position[];
  localNames: Array<{ position: Position; name: { en: string; es: string } }>;
};

const STAFFABLE = AREAS.filter((a) => a !== "corporate").flatMap((a) => positionsIn(a));

const blank = (): Draft => ({
  name: "",
  slug: "",
  address: "",
  reservationsUrl: "",
  active: true,
  services: [{ key: "dinner", weekdays: [0, 1, 2, 3, 4, 5, 6], startsAt: "17:00", endsAt: "23:00", preShiftMin: 30 }],
  positionsUsed: STAFFABLE.filter((p) => p !== "sommelier"),
  localNames: [],
});

function fromVenue(v: Doc<"venues">): Draft {
  return {
    venueId: v._id,
    name: v.name,
    slug: v.slug,
    address: v.address ?? "",
    reservationsUrl: v.reservationsUrl ?? "",
    active: v.active,
    services: v.services.map((s) => ({ ...s })),
    positionsUsed: v.positionsUsed as Position[],
    localNames: v.localNames as Draft["localNames"],
  };
}

/** Venues and their services by weekday (BLUEPRINT 2.7): new venues are configuration, not code. */
export function VenuesSetup() {
  const { t } = useLocale();
  const venues = useQuery(api.org.allVenues, {});
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("company.venues.title")}
        back="/company/setup"
        action={
          <Button size="md" icon={<Plus weight="bold" />} onClick={() => setDraft(blank())}>
            {t("company.venues.add")}
          </Button>
        }
      />
      {venues === undefined ? (
        <ScreenSkeleton rows={4} />
      ) : venues.length === 0 ? (
        <EmptyState icon={<Buildings weight="bold" />} title={t("company.noVenues")} />
      ) : (
        <List>
          {[...venues]
            .sort((a, b) => a.sort - b.sort)
            .map((v) => (
              <ButtonRow
                key={v._id}
                onClick={() => setDraft(fromVenue(v))}
                title={v.name}
                subtitle={[v.address, t("company.venues.servicesLine", { count: v.services.length })].filter(Boolean).join(" · ")}
                trailing={!v.active ? <StatusChip tone="neutral" size="sm">{t("company.venues.inactive")}</StatusChip> : undefined}
              />
            ))}
        </List>
      )}
      {draft ? <VenueSheet key={draft.venueId ?? "new"} initial={draft} onClose={() => setDraft(null)} /> : null}
    </div>
  );
}

function VenueSheet({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const { t, locale } = useLocale();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useRun(api.org.upsertVenue, { success: t("company.venues.saved"), silent: true });
  const days = weekdayNames(locale);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setService = (i: number, patch: Partial<ServiceDraft>) => set("services", d.services.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async () => {
    setError(null);
    const payload = {
      venueId: d.venueId,
      name: d.name,
      slug: d.slug,
      address: d.address || undefined,
      services: d.services,
      positionsUsed: d.positionsUsed,
      localNames: d.localNames.filter((l) => d.positionsUsed.includes(l.position)),
      reservationsUrl: d.reservationsUrl || undefined,
      active: d.active,
    };
    const parsed = venueInput.safeParse(payload);
    if (!parsed.success) {
      setError(t("errors.INVALID_INPUT"));
      return;
    }
    const r = await save.run(payload);
    if (r) onClose();
  };

  const fieldErr = save.fields.slug === "taken" ? t("company.venues.slugTaken") : undefined;
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={d.venueId ? t("company.venues.edit") : t("company.venues.new")}
      footer={
        <div className="flex flex-col gap-2">
          <InlineError>{error ?? (save.error && !fieldErr ? save.message : null)}</InlineError>
          <Button block loading={save.busy} onClick={() => void submit()}>
            {t("company.venues.save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <Field label={t("company.venues.name")}>{(p) => <Input {...p} value={d.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label={t("company.venues.slug")} help={t("company.venues.slugHelp")} error={fieldErr}>
          {(p) => <Input {...p} value={d.slug} maxLength={24} autoCapitalize="none" onChange={(e) => set("slug", e.target.value.toLowerCase())} />}
        </Field>
        <Field label={t("company.venues.address")} optional={t("common.optional")}>
          {(p) => <Input {...p} value={d.address} maxLength={120} onChange={(e) => set("address", e.target.value)} />}
        </Field>
        <Field label={t("company.venues.reservations")} help={t("company.venues.reservationsHelp")} optional={t("common.optional")}>
          {(p) => <Input {...p} type="url" inputMode="url" value={d.reservationsUrl} onChange={(e) => set("reservationsUrl", e.target.value)} />}
        </Field>
        <SwitchRow label={t("company.venues.active")} help={t("company.venues.activeHelp")} checked={d.active} onChange={(v) => set("active", v)} />

        <Section title={t("company.venues.services")}>
          <p className="px-1 text-small text-ink-muted">{t("company.venues.servicesHelp")}</p>
          {d.services.map((s, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-card border border-line p-3">
              <div className="flex items-end gap-2">
                <Field label={t("company.venues.service")} className="flex-1">
                  {(p) => (
                    <Select {...p} value={s.key} onChange={(e) => setService(i, { key: e.target.value as Service })}>
                      {SERVICES.map((k) => (
                        <option key={k} value={k}>
                          {t(`services.${k}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {d.services.length > 1 ? (
                  <IconButton label={t("company.venues.removeService")} onClick={() => set("services", d.services.filter((_, j) => j !== i))}>
                    <Trash weight="bold" className="size-5" />
                  </IconButton>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t("company.venues.starts")}>{(p) => <Input {...p} type="time" value={s.startsAt} onChange={(e) => setService(i, { startsAt: e.target.value })} />}</Field>
                <Field label={t("company.venues.ends")}>{(p) => <Input {...p} type="time" value={clock(s.endsAt)} onChange={(e) => setService(i, { endsAt: e.target.value })} />}</Field>
                <Field label={t("company.venues.preShift")}>
                  {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={120} value={s.preShiftMin} onChange={(e) => setService(i, { preShiftMin: Number(e.target.value) || 0 })} />}
                </Field>
              </div>
              <p className="text-caption text-ink-muted">{t("company.venues.endsHelp")}</p>
              <ToggleChips label={t("company.venues.weekdays")} options={days.map((n, k) => ({ value: k, label: n }))} value={s.weekdays} onChange={(w) => setService(i, { weekdays: [...w].sort() })} />
            </div>
          ))}
          {d.services.length < 3 ? (
            <Button
              variant="secondary"
              size="md"
              icon={<Plus weight="bold" />}
              onClick={() => set("services", [...d.services, { key: SERVICES.find((k) => !d.services.some((s) => s.key === k)) ?? "lunch", weekdays: [1, 2, 3, 4, 5], startsAt: "11:30", endsAt: "15:00", preShiftMin: 30 }])}
            >
              {t("company.venues.addService")}
            </Button>
          ) : null}
        </Section>

        <Section title={t("company.venues.positionsUsed")}>
          <p className="px-1 text-small text-ink-muted">{t("company.venues.positionsUsedHelp")}</p>
          {AREAS.filter((a) => a !== "corporate").map((a) => (
            <div key={a} className="flex flex-col gap-2">
              <span className="px-1 text-small font-semibold text-ink">{t(`areas.${a}`)}</span>
              <ToggleChips
                label={t(`areas.${a}`)}
                options={positionsIn(a).map((p) => ({ value: p, label: t(`positions.${p}`) }))}
                value={d.positionsUsed.filter((p) => positionsIn(a).includes(p))}
                onChange={(sel) => set("positionsUsed", [...d.positionsUsed.filter((p) => !positionsIn(a).includes(p)), ...sel])}
              />
            </div>
          ))}
        </Section>
        {d.venueId ? (
          <List>
            <LinkRow href={`/company/setup/positions?venue=${d.venueId}`} title={t("company.setup.positions")} subtitle={t("company.setup.positionsHint")} />
          </List>
        ) : null}
      </div>
    </Sheet>
  );
}
