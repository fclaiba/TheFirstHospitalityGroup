"use client";

import { useMemo, useState } from "react";
import { ForkKnife, Plus } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useMe, useVenue } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized, missingTranslations } from "@/lib/domain/i18n";
import { ALLERGENS, MENU_CATEGORIES } from "@/lib/domain/types";
import { money, parseCents } from "@/lib/format";
import { menuItemInput } from "@/schemas";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, Input, Select, Switch, SwitchRow, Textarea } from "@/components/ui/field";
import { List, PageHeader, Section } from "@/components/ui/layout";
import { PhotoField } from "@/components/ui/photo-field";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { Sheet } from "@/components/ui/sheet";
import { MenuPhoto } from "./parts";
import type { MenuItemView } from "./parts";

/** Menu setup (BLUEPRINT 6.1 /manage/setup/menu): the owner edits the catalog; managers set availability and price. */
export function MenuSetup() {
  const { t } = useLocale();
  const me = useMe();
  const isOwner = !!me?.isOwner;
  const [tab, setTab] = useState<"catalog" | "venue">("catalog");
  if (!me) return <ScreenSkeleton />;
  const view = isOwner ? tab : "venue";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back="/manage/setup" title={t("menu.setup.title")} subtitle={view === "catalog" ? t("menu.setup.subtitleOwner") : t("menu.setup.subtitleManager")} />
      {isOwner ? (
        <Segmented
          label={t("menu.setup.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "catalog", label: t("menu.setup.catalogTab") },
            { value: "venue", label: t("menu.setup.venueTab") },
          ]}
        />
      ) : null}
      {view === "catalog" ? <Catalog /> : <VenueAvailability />}
    </div>
  );
}

function Catalog() {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const items = useQuery(api.menu.list, venueId ? { venueId, includeInactive: true } : "skip") as MenuItemView[] | undefined;
  const [editing, setEditing] = useState<MenuItemView | "new" | null>(null);
  const groups = useMemo(() => {
    const out = new Map<string, MenuItemView[]>();
    for (const i of items ?? []) out.set(i.category, [...(out.get(i.category) ?? []), i]);
    return [...out.entries()];
  }, [items]);
  if (items === undefined) return <ScreenSkeleton />;
  return (
    <div className="flex flex-col gap-6">
      <Button icon={<Plus weight="bold" />} onClick={() => setEditing("new")} className="self-start">
        {t("menu.setup.new")}
      </Button>
      {!items.length ? <EmptyState icon={<ForkKnife weight="bold" />} title={t("menu.setup.emptyTitle")} body={t("menu.setup.emptyBody")} /> : null}
      {groups.map(([cat, list]) => (
        <Section key={cat} title={t(`menu.category.${cat}`)}>
          <List>
            {list.map((i) => {
              const missing = missingTranslations({ name: i.name, description: i.description, ingredients: i.ingredients }).length;
              return (
                <li key={i._id}>
                  <button type="button" onClick={() => setEditing(i)} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left">
                    <div className="w-16 shrink-0 overflow-hidden rounded-input">
                      <MenuPhoto url={i.photoUrl} alt="" />
                    </div>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-body font-semibold text-ink">{pickLocalized(i.name, locale)}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {missing ? (
                          <StatusChip tone="attention" size="sm">
                            {t("menu.setup.incomplete", { n: missing })}
                          </StatusChip>
                        ) : (
                          <StatusChip tone="ok" size="sm">
                            {t("menu.setup.complete")}
                          </StatusChip>
                        )}
                        {!i.active ? (
                          <StatusChip tone="neutral" size="sm" icon={false}>
                            {t("menu.setup.inactive")}
                          </StatusChip>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-small font-semibold text-ink tabular">{money(locale, i.basePriceCents)}</span>
                  </button>
                </li>
              );
            })}
          </List>
        </Section>
      ))}
      {editing ? <ItemSheet item={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

const emptyForm = {
  nameEn: "",
  nameEs: "",
  descriptionEn: "",
  descriptionEs: "",
  ingredientsEn: "",
  ingredientsEs: "",
  category: "mains" as string,
  price: "",
  allergens: [] as string[],
  tags: "",
  active: true,
  photoId: null as string | null,
};

function ItemSheet({ item, onClose }: { item: MenuItemView | null; onClose: () => void }) {
  const { t } = useLocale();
  const [f, setF] = useState(() =>
    item
      ? {
          nameEn: item.name.en,
          nameEs: item.name.es,
          descriptionEn: item.description.en,
          descriptionEs: item.description.es,
          ingredientsEn: item.ingredients.en,
          ingredientsEs: item.ingredients.es,
          category: item.category,
          price: (item.basePriceCents / 100).toFixed(item.basePriceCents % 100 ? 2 : 0),
          allergens: item.allergens,
          tags: item.tags.join(", "),
          active: item.active,
          photoId: item.photoId,
        }
      : emptyForm,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useRun(api.menu.upsert, { success: t("menu.setup.saved") });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const missing = missingTranslations({ name: { en: f.nameEn, es: f.nameEs }, description: { en: f.descriptionEn, es: f.descriptionEs }, ingredients: { en: f.ingredientsEn, es: f.ingredientsEs } }).length;

  const submit = async () => {
    const priceCents = parseCents(f.price);
    const input = {
      itemId: item?._id as Id<"menuItems"> | undefined,
      name: { en: f.nameEn, es: f.nameEs },
      description: { en: f.descriptionEn, es: f.descriptionEs },
      ingredients: { en: f.ingredientsEn, es: f.ingredientsEs },
      allergens: f.allergens,
      category: f.category,
      priceCents: priceCents ?? -1,
      photoId: (f.photoId ?? undefined) as Id<"_storage"> | undefined,
      tags: f.tags
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(Boolean),
      active: f.active,
    };
    const parsed = menuItemInput.safeParse(input);
    const out: Record<string, string> = {};
    if (priceCents === null) out.priceCents = t("menu.setup.invalidPrice");
    if (!parsed.success) for (const i of parsed.error.issues) out[i.path.join(".")] ??= i.path[0] === "priceCents" ? t("menu.setup.invalidPrice") : t("errors.INVALID_INPUT");
    setErrors(out);
    if (Object.keys(out).length) return;
    const r = await save.run(input);
    if (r) onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? t("menu.setup.edit") : t("menu.setup.new")}
      description={missing ? t("menu.setup.incomplete", { n: missing }) : t("menu.setup.complete")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("menu.setup.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <PhotoField value={f.photoId} onChange={(photoId) => setF((x) => ({ ...x, photoId }))} purpose="menu" label={t("menu.setup.photo")} />
        <Field label={t("menu.setup.nameEn")} error={errors["name.en"]}>
          {(p) => <Input {...p} lang="en" value={f.nameEn} onChange={set("nameEn")} />}
        </Field>
        <Field label={t("menu.setup.nameEs")} error={errors["name.es"]}>
          {(p) => <Input {...p} lang="es" value={f.nameEs} onChange={set("nameEs")} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("menu.setup.category")}>
            {(p) => (
              <Select {...p} value={f.category} onChange={set("category")}>
                {MENU_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`menu.category.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("menu.setup.price")} help={t("menu.setup.priceHelp")} error={errors.priceCents}>
            {(p) => <Input {...p} inputMode="decimal" value={f.price} onChange={set("price")} className="font-mono" />}
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-semibold text-ink">{t("menu.setup.allergensLabel")}</legend>
          <p className="text-small text-ink-muted">{t("menu.setup.allergensHelp")}</p>
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
        <Field label={t("menu.setup.descriptionEn")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="en" value={f.descriptionEn} onChange={set("descriptionEn")} />}
        </Field>
        <Field label={t("menu.setup.descriptionEs")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="es" value={f.descriptionEs} onChange={set("descriptionEs")} />}
        </Field>
        <Field label={t("menu.setup.ingredientsEn")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="en" value={f.ingredientsEn} onChange={set("ingredientsEn")} />}
        </Field>
        <Field label={t("menu.setup.ingredientsEs")} optional={t("common.optional")}>
          {(p) => <Textarea {...p} lang="es" value={f.ingredientsEs} onChange={set("ingredientsEs")} />}
        </Field>
        <Field label={t("menu.setup.tagsLabel")} help={t("menu.setup.tagsHelp")} optional={t("common.optional")}>
          {(p) => <Input {...p} value={f.tags} onChange={set("tags")} autoCapitalize="none" />}
        </Field>
        <SwitchRow label={t("menu.setup.active")} help={t("menu.setup.activeHelp")} checked={f.active} onChange={(active) => setF((x) => ({ ...x, active }))} />
        <InlineError>{save.message}</InlineError>
      </div>
    </Sheet>
  );
}

function VenueAvailability() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const items = useQuery(api.menu.list, venueId ? { venueId } : "skip") as MenuItemView[] | undefined;
  if (!venueId || items === undefined) return <ScreenSkeleton />;
  if (!items.length) return <EmptyState icon={<ForkKnife weight="bold" />} title={t("menu.emptyCatalogTitle")} body={t("menu.emptyCatalogBody")} />;
  return (
    <Section title={t("menu.setup.venueLabel", { venue: venueName })}>
      <List>
        {items.map((i) => (
          <AvailabilityRow key={i._id} item={i} venueId={venueId} name={pickLocalized(i.name, locale)} />
        ))}
      </List>
    </Section>
  );
}

function AvailabilityRow({ item, venueId, name }: { item: MenuItemView; venueId: Id<"venues">; name: string }) {
  const { t, locale } = useLocale();
  const run = useRun(api.menu.setAvailability);
  const [price, setPrice] = useState(item.priceOverridden ? (item.priceCents / 100).toFixed(item.priceCents % 100 ? 2 : 0) : "");
  const [error, setError] = useState<string | null>(null);
  const savePrice = async () => {
    const raw = price.trim();
    const cents = raw ? parseCents(raw) : null;
    if (raw && cents === null) return setError(t("menu.setup.invalidPrice"));
    setError(null);
    const current = item.priceOverridden ? item.priceCents : null;
    if (cents === current) return;
    const r = await run.run({ itemId: item._id as Id<"menuItems">, venueId, available: item.available, priceOverrideCents: cents });
    if (r) toast(t("menu.setup.overrideSaved"), "ok");
  };
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body font-semibold text-ink">{name}</span>
          <span className="text-small text-ink-muted">
            {item.available ? t("menu.available") : t("menu.unavailable")}, {money(locale, item.basePriceCents)}
          </span>
        </span>
        <Switch
          checked={item.available}
          label={`${t("menu.availabilityToggle")}: ${name}`}
          disabled={run.busy}
          onChange={(available) => void run.run({ itemId: item._id as Id<"menuItems">, venueId, available })}
        />
      </div>
      <Field label={t("menu.setup.override")} help={t("menu.setup.overrideHelp")} error={error ?? undefined}>
        {(p) => <Input {...p} inputMode="decimal" value={price} placeholder={(item.basePriceCents / 100).toFixed(2)} onChange={(e) => setPrice(e.target.value)} onBlur={() => void savePrice()} className="max-w-40 font-mono" />}
      </Field>
    </li>
  );
}
