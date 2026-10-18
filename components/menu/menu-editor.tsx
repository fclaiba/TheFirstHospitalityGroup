"use client";

import { useMemo, useState } from "react";
import { Check, ForkKnife, Plus, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { missingTranslations, pickLocalized } from "@/lib/domain/i18n";
import { ALLERGENS, MENU_CATEGORIES, MENU_KINDS } from "@/lib/domain/types";
import type { MenuKind } from "@/lib/domain/types";
import { menuItemInput } from "@/schemas";
import { cn } from "@/lib/cn";
import { ago } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, Input, Select, Switch, SwitchRow, Textarea } from "@/components/ui/field";
import { List, PageHeader, Section } from "@/components/ui/layout";
import { PhotoField } from "@/components/ui/photo-field";
import { EmptyState, InlineError, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { Sheet } from "@/components/ui/sheet";
import { AllergenChips, MenuPhoto } from "./parts";
import type { MenuItemView } from "./parts";

/** Which categories belong to which kind (food, drinks, wine). */
export const CATEGORIES_OF: Record<MenuKind, string[]> = {
  food: ["starters", "mains", "sides", "desserts", "tasting"],
  drink: ["cocktails", "spirits", "beer", "zero_proof"],
  wine: ["wine_sparkling", "wine_white", "wine_red", "wine_dessert"],
};

const KINDS_FOR = (corporate: boolean, mode: "edit" | "propose"): MenuKind[] => (mode === "propose" ? ["drink", "wine"] : corporate ? [...MENU_KINDS] : ["food"]);

/**
 * The menu editor (BLUEPRINT 6.1 /manage/menu, /company/setup/menu): the chef de cuisine edits food, corporate edits
 * everything, the head bartender and the sommelier propose drinks and wine, and the GM approves the proposals. No
 * prices anywhere (ADR 0018). Every content change asks front of house to confirm it again (ADR 0022).
 */
export function MenuEditorScreen({ back, title }: { back?: string; title?: string }) {
  const { t } = useLocale();
  const me = useMe();
  const canEdit = canDo(me, "menu.edit");
  const canApprove = canDo(me, "menu.approve");
  const canPropose = canDo(me, "menu.propose");
  const [tab, setTab] = useState<"catalog" | "proposals">(canEdit ? "catalog" : "proposals");
  if (!me) return <ScreenSkeleton />;
  if (!canEdit && !canApprove && !canPropose) return <LockedState title={t("common.noAccess")} body={t("screenGuide.menuAccess")} action={<ButtonLink href={canDo(me, "menu.availability") ? "/manage/setup/menu-availability" : "/menu"} variant="secondary">{t(canDo(me, "menu.availability") ? "menuEditor.availabilityLink" : "nav.menu")}</ButtonLink>} />;
  const tabs = [...(canEdit || canPropose ? (["catalog"] as const) : []), ...(canApprove || canPropose ? (["proposals"] as const) : [])];
  const view = tabs.includes(tab as never) ? tab : tabs[0]!;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={back} title={title ?? t("menuEditor.title")} subtitle={canEdit ? (me.isCorporate ? t("menuEditor.subtitleCorporate") : t("menuEditor.subtitleChef")) : canApprove ? t("menuEditor.subtitleGm") : t("menuEditor.subtitlePropose")} />
      {tabs.length > 1 ? (
        <Segmented
          label={t("menuEditor.title")}
          value={view}
          onChange={setTab}
          options={tabs.map((v) => ({ value: v, label: t(`menuEditor.tabs.${v}`) }))}
        />
      ) : null}
      {view === "catalog" ? <Catalog mode={canEdit ? "edit" : "propose"} corporate={!!me.isCorporate} /> : <Proposals />}
      {canDo(me, "menu.availability") ? (
        <ButtonLink href="/manage/setup/menu-availability" variant="secondary" size="md" className="self-start">
          {t("menuEditor.availabilityLink")}
        </ButtonLink>
      ) : null}
    </div>
  );
}

function Catalog({ mode, corporate }: { mode: "edit" | "propose"; corporate: boolean }) {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const items = useQuery(api.menu.list, venueId ? { venueId, includeInactive: true } : "skip") as MenuItemView[] | undefined;
  const kinds = KINDS_FOR(corporate, mode);
  const [editing, setEditing] = useState<MenuItemView | "new" | null>(null);
  const groups = useMemo(() => {
    const out = new Map<string, MenuItemView[]>();
    for (const i of (items ?? []).filter((x) => kinds.includes(x.kind as MenuKind))) out.set(i.category, [...(out.get(i.category) ?? []), i]);
    return [...out.entries()];
  }, [items, kinds]);
  if (items === undefined) return <ScreenSkeleton />;
  return (
    <div className="flex flex-col gap-6">
      <Button icon={<Plus weight="bold" />} onClick={() => setEditing("new")} className="self-start">
        {mode === "edit" ? t("menuEditor.new") : t("menuEditor.proposeNew")}
      </Button>
      {!groups.length ? <EmptyState icon={<ForkKnife weight="bold" />} title={t("menuEditor.emptyTitle")} body={t("menuEditor.emptyBody")} /> : null}
      {groups.map(([cat, list]) => (
        <Section key={cat} title={t(`menu.category.${cat}`)}>
          <List>
            {list.map((i) => {
              const missing = missingTranslations({ name: i.name, description: i.description, ingredients: i.ingredients }).length;
              return (
                <li key={i._id}>
                  <button type="button" onClick={() => setEditing(i)} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left">
                    <span className="w-16 shrink-0 overflow-hidden rounded-input">
                      <MenuPhoto url={i.photoUrl} alt="" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-body font-semibold text-ink">{pickLocalized(i.name, locale)}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {missing ? (
                          <StatusChip tone="attention" size="sm">
                            {t("menuEditor.incomplete", { n: missing })}
                          </StatusChip>
                        ) : (
                          <StatusChip tone="ok" size="sm">
                            {t("menuEditor.complete")}
                          </StatusChip>
                        )}
                        {!i.active ? (
                          <StatusChip tone="neutral" size="sm" icon={false}>
                            {t("menuEditor.hidden")}
                          </StatusChip>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </List>
        </Section>
      ))}
      {editing ? <ItemSheet item={editing === "new" ? null : editing} mode={mode} corporate={corporate} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function Proposals() {
  const { t, locale } = useLocale();
  const list = useQuery(api.menu.proposals, {});
  const decide = useRun(api.menu.decideProposal);
  if (list === undefined) return <ScreenSkeleton rows={2} />;
  if (!list.length) return <EmptyState icon={<ForkKnife weight="bold" />} title={t("menuEditor.noProposalsTitle")} body={t("menuEditor.noProposalsBody")} />;
  return (
    <ul className="flex flex-col gap-3">
      {list.map((p) => (
        <li key={p._id} className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4">
          <div className="flex items-start gap-3">
            <span className="w-20 shrink-0 overflow-hidden rounded-input">
              <MenuPhoto url={p.photoUrl} alt="" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-lead font-bold text-ink">{pickLocalized(p.name, locale)}</span>
              <span className="text-small text-ink-muted">
                {p.replaces ? t("menuEditor.changeTo", { name: pickLocalized(p.replaces.name, locale) }) : t("menuEditor.newItem")}. {t("menuEditor.proposedBy", { name: p.proposedByName, when: ago(t, p.changedAt) })}
              </span>
            </div>
          </div>
          {pickLocalized(p.description, locale) ? <p className="text-body text-ink">{pickLocalized(p.description, locale)}</p> : null}
          <AllergenChips allergens={p.allergens} size="sm" />
          {p.canDecide ? (
            <div className="grid grid-cols-2 gap-2">
              <Button size="md" icon={<Check weight="bold" />} loading={decide.busy} onClick={() => void decide.run({ itemId: p._id as Id<"menuItems">, approve: true })}>
                {t("menuEditor.approve")}
              </Button>
              <Button variant="secondary" size="md" icon={<X weight="bold" />} loading={decide.busy} onClick={() => void decide.run({ itemId: p._id as Id<"menuItems">, approve: false })}>
                {t("menuEditor.decline")}
              </Button>
            </div>
          ) : (
            <StatusChip tone="attention" className="self-start">
              {t("states.pending")}
            </StatusChip>
          )}
        </li>
      ))}
    </ul>
  );
}

type Form = {
  kind: MenuKind;
  nameEn: string;
  nameEs: string;
  descriptionEn: string;
  descriptionEs: string;
  ingredientsEn: string;
  ingredientsEs: string;
  pairingEn: string;
  pairingEs: string;
  course: string;
  category: string;
  allergens: string[];
  tags: string;
  active: boolean;
  photoId: string | null;
};

/**
 * Edit an item (chef, corporate) or propose a drink or wine (head bartender, sommelier). In propose mode, an existing
 * item is sent as a proposed change (`replaces`) for the GM to approve.
 */
export function ItemSheet({ item, mode, corporate, onClose }: { item: MenuItemView | null; mode: "edit" | "propose"; corporate: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const { venueId } = useVenue();
  const kinds = KINDS_FOR(corporate, mode);
  const [f, setF] = useState<Form>(() => {
    const kind = (item?.kind as MenuKind | undefined) ?? kinds[0]!;
    return {
      kind,
      nameEn: item?.name.en ?? "",
      nameEs: item?.name.es ?? "",
      descriptionEn: item?.description.en ?? "",
      descriptionEs: item?.description.es ?? "",
      ingredientsEn: item?.ingredients.en ?? "",
      ingredientsEs: item?.ingredients.es ?? "",
      pairingEn: item?.pairing?.en ?? "",
      pairingEs: item?.pairing?.es ?? "",
      course: item?.course ? String(item.course) : "",
      category: item?.category ?? CATEGORIES_OF[kind][0]!,
      allergens: item?.allergens ?? [],
      tags: item?.tags.join(", ") ?? "",
      active: item?.active ?? true,
      photoId: item?.photoId ?? null,
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useRun(api.menu.upsert, { success: t("menuEditor.saved") });
  const propose = useRun(api.menu.propose, { success: t("menuEditor.proposed") });
  const busy = save.busy || propose.busy;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const missing = missingTranslations({ name: { en: f.nameEn, es: f.nameEs }, description: { en: f.descriptionEn, es: f.descriptionEs }, ingredients: { en: f.ingredientsEn, es: f.ingredientsEs } }).length;

  const submit = async () => {
    const pairing = f.pairingEn.trim() || f.pairingEs.trim() ? { en: f.pairingEn, es: f.pairingEs } : undefined;
    const course = f.course.trim() ? Number(f.course) : undefined;
    const fields = {
      kind: f.kind,
      name: { en: f.nameEn, es: f.nameEs },
      description: { en: f.descriptionEn, es: f.descriptionEs },
      ingredients: { en: f.ingredientsEn, es: f.ingredientsEs },
      allergens: f.allergens,
      pairing,
      course,
      category: f.category,
      photoId: (f.photoId ?? undefined) as Id<"_storage"> | undefined,
      tags: f.tags
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(Boolean),
      active: f.active,
    };
    const parsed = menuItemInput.safeParse(fields);
    const out: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) out[i.path.join(".")] ??= t("errors.INVALID_INPUT");
    setErrors(out);
    if (Object.keys(out).length) return;
    const r =
      mode === "edit"
        ? await save.run({ itemId: item?._id as Id<"menuItems"> | undefined, ...fields })
        : await propose.run({ replaces: item?._id as Id<"menuItems"> | undefined, venueId: venueId ?? undefined, ...fields });
    if (r) onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === "propose" ? (item ? t("menuEditor.proposeChange") : t("menuEditor.proposeNew")) : item ? t("menuEditor.edit") : t("menuEditor.new")}
      description={mode === "propose" ? t("menuEditor.proposeHelp") : missing ? t("menuEditor.incomplete", { n: missing }) : t("menuEditor.complete")}
      footer={
        <Button block loading={busy} onClick={() => void submit()}>
          {mode === "propose" ? t("menuEditor.sendProposal") : t("menuEditor.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <PhotoField value={f.photoId} onChange={(photoId) => setF((x) => ({ ...x, photoId }))} purpose="menu" label={t("menuEditor.photo")} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("menuEditor.kind")}>
            {(p) => (
              <Select
                {...p}
                value={f.kind}
                disabled={!!item || kinds.length < 2}
                onChange={(e) => {
                  const kind = e.target.value as MenuKind;
                  setF((x) => ({ ...x, kind, category: CATEGORIES_OF[kind][0]! }));
                }}
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {t(`menu.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("menuEditor.category")}>
            {(p) => (
              <Select {...p} value={f.category} onChange={set("category")}>
                {MENU_CATEGORIES.filter((c) => CATEGORIES_OF[f.kind].includes(c)).map((c) => (
                  <option key={c} value={c}>
                    {t(`menu.category.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("menuEditor.nameEn")} error={errors["name.en"]}>
          {(p) => <Input {...p} lang="en" value={f.nameEn} onChange={set("nameEn")} />}
        </Field>
        <Field label={t("menuEditor.nameEs")} error={errors["name.es"]}>
          {(p) => <Input {...p} lang="es" value={f.nameEs} onChange={set("nameEs")} />}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-semibold text-ink">{t("menuEditor.allergens")}</legend>
          <p className="text-small text-ink-muted">{t("menuEditor.allergensHelp")}</p>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = f.allergens.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF((x) => ({ ...x, allergens: on ? x.allergens.filter((y) => y !== a) : [...x.allergens, a] }))}
                  className={cn(
                    "pressable inline-flex min-h-target items-center rounded-pill border px-3.5 text-small font-semibold",
                    on ? "border-review-fg bg-review-bg text-review-fg" : "hover-line border-line-strong bg-canvas text-ink",
                  )}
                >
                  {t(`menu.allergen.${a}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label={t("menuEditor.descriptionEn")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="en" value={f.descriptionEn} onChange={set("descriptionEn")} />}
        </Field>
        <Field label={t("menuEditor.descriptionEs")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="es" value={f.descriptionEs} onChange={set("descriptionEs")} />}
        </Field>
        <Field label={t("menuEditor.ingredientsEn")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="en" value={f.ingredientsEn} onChange={set("ingredientsEn")} />}
        </Field>
        <Field label={t("menuEditor.ingredientsEs")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="es" value={f.ingredientsEs} onChange={set("ingredientsEs")} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("menuEditor.pairingEn")} optional={t("common.optional")}>
            {(p) => <Input {...p} lang="en" value={f.pairingEn} onChange={set("pairingEn")} />}
          </Field>
          <Field label={t("menuEditor.pairingEs")} optional={t("common.optional")}>
            {(p) => <Input {...p} lang="es" value={f.pairingEs} onChange={set("pairingEs")} />}
          </Field>
        </div>
        {f.kind === "food" ? (
          <Field label={t("menuEditor.course")} help={t("menuEditor.courseHelp")} optional={t("common.optional")}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={20} value={f.course} onChange={set("course")} className="max-w-32" />}
          </Field>
        ) : null}
        <Field label={t("menuEditor.tags")} help={t("menuEditor.tagsHelp")} optional={t("common.optional")}>
          {(p) => <Input {...p} value={f.tags} onChange={set("tags")} autoCapitalize="none" />}
        </Field>
        <SwitchRow label={t("menuEditor.active")} help={t("menuEditor.activeHelp")} checked={f.active} onChange={(active) => setF((x) => ({ ...x, active }))} />
        <InlineError>{save.message ?? propose.message}</InlineError>
      </div>
    </Sheet>
  );
}

/** Availability per venue (BLUEPRINT 6.1 /manage/setup/menu-availability): what this venue serves today. */
export function MenuAvailability() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const items = useQuery(api.menu.list, venueId ? { venueId } : "skip") as MenuItemView[] | undefined;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back="/manage/setup" title={t("menuEditor.availabilityTitle")} subtitle={t("menuEditor.availabilitySubtitle", { venue: venueName })} />
      {!venueId || items === undefined ? (
        <ScreenSkeleton />
      ) : !items.length ? (
        <EmptyState icon={<ForkKnife weight="bold" />} title={t("menu.emptyCatalogTitle")} body={t("menu.emptyCatalogBody")} />
      ) : (
        <List>
          {items.map((i) => (
            <AvailabilityRow key={i._id} item={i} venueId={venueId} name={pickLocalized(i.name, locale)} />
          ))}
        </List>
      )}
    </div>
  );
}

function AvailabilityRow({ item, venueId, name }: { item: MenuItemView; venueId: Id<"venues">; name: string }) {
  const { t } = useLocale();
  const run = useRun(api.menu.setAvailability);
  return (
    <li className="flex min-h-target-lg items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body font-semibold text-ink">{name}</span>
        <span className="text-small text-ink-muted">
          {t(`menu.kinds.${item.kind}`)}, {item.available ? t("menu.available") : t("menu.unavailable")}
        </span>
      </span>
      <Switch checked={item.available} label={`${t("menu.availabilityToggle")}: ${name}`} disabled={run.busy} onChange={(available) => void run.run({ itemId: item._id as Id<"menuItems">, venueId, available })} />
    </li>
  );
}
