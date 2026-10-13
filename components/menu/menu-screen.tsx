"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ForkKnife, GraduationCap, MagnifyingGlass, Prohibit, Sparkle, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { MENU_KINDS } from "@/lib/domain/types";
import type { MenuKind } from "@/lib/domain/types";
import { toast } from "@/lib/toast";
import { PageHeader, Section } from "@/components/ui/layout";
import { Segmented } from "@/components/ui/choice";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import { AckBanner, ConfirmCard } from "@/components/app/confirm";
import { CategoryTabs, ContentLangToggle, MenuCard, MenuPhoto, useContentLocale } from "./parts";
import type { MenuItemView } from "./parts";
import { useMenuWithCache } from "./cache";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Menu (BLUEPRINT 2.6, 6.1 /menu): food, drinks and wine with photos, allergens and pairings; no prices (ADR 0018).
 * Tonight's 86s sit on top; new or changed items ask for "I saw it" before the next shift (ADR 0022).
 */
export function MenuScreen() {
  const { t, locale } = useLocale();
  const params = useSearchParams();
  const online = useOnline();
  const { venueId } = useVenue();
  const live = useQuery(api.menu.list, venueId ? { venueId } : "skip") as MenuItemView[] | undefined;
  const { items, stale } = useMenuWithCache(venueId, live);
  const pending = useQuery(api.menu.pendingAcks, {});
  const [content, toggleContent] = useContentLocale();
  const [kind, setKind] = useState<MenuKind>("food");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const query = useDeferredValue(q);

  const kinds = useMemo(() => MENU_KINDS.filter((k) => (items ?? []).some((i) => i.kind === k)), [items]);
  const activeKind = kinds.includes(kind) ? kind : (kinds[0] ?? "food");
  const ofKind = useMemo(() => (items ?? []).filter((i) => i.kind === activeKind), [items, activeKind]);
  const categories = useMemo(() => [...new Set(ofKind.map((i) => i.category))], [ofKind]);
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    const pool = needle ? (items ?? []) : ofKind;
    return pool.filter((i) => {
      if (!needle && category && i.category !== category) return false;
      if (!needle) return true;
      const hay = fold([i.name.en, i.name.es, i.description.en, i.description.es, i.ingredients.en, i.ingredients.es, ...i.tags, ...i.allergens].join(" "));
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [items, ofKind, query, category]);
  const groups = useMemo(() => {
    const out = new Map<string, MenuItemView[]>();
    for (const i of filtered) out.set(i.category, [...(out.get(i.category) ?? []), i]);
    return [...out.entries()];
  }, [filtered]);
  const eightySixed = (items ?? []).filter((i) => i.is86);

  if (params.get("pending")) return <PendingAcks />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("menu.title")} subtitle={t("menu.subtitle")} action={<ContentLangToggle content={content} onToggle={toggleContent} />} />

      {pending?.length ? (
        <ConfirmCard kind="menu" href="/menu?pending=1" title={t("menu.pendingTitle", { n: pending.length })} body={t("menu.pendingBody")} />
      ) : null}

      {eightySixed.length ? (
        <section aria-labelledby="eighty-six" className="flex flex-col gap-2 rounded-card border border-review-fg/30 bg-review-bg px-4 py-3">
          <h2 id="eighty-six" className="flex items-center gap-2 text-small font-semibold tracking-label text-review-fg uppercase">
            <Prohibit weight="bold" className="size-4" aria-hidden />
            {t("eightySix.tonight")}
          </h2>
          <ul className="flex flex-col gap-1">
            {eightySixed.map((i) => (
              <li key={i._id} className="text-body text-ink">
                <Link href={`/menu/${i._id}`} className="font-semibold underline-offset-4 hover:underline">
                  {pickLocalized(i.name, locale)}
                </Link>
                {i.eightySixNote ? <span className="text-ink-muted">. {i.eightySixNote}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="material sticky top-[calc(3.5rem+var(--safe-top))] z-20 -mx-4 flex flex-col gap-3 px-4 pt-1 pb-3">
        {kinds.length > 1 ? <Segmented label={t("menu.kindsLabel")} value={activeKind} onChange={(k) => {
              setKind(k);
              setCategory(null);
            }} options={kinds.map((k) => ({ value: k, label: t(`menu.kinds.${k}`) }))} /> : null}
        <label className="relative block">
          <span className="sr-only">{t("menu.searchLabel")}</span>
          <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("menu.search")}
            enterKeyHint="search"
            autoCorrect="off"
            className="h-target-lg w-full rounded-pill border border-line-strong bg-canvas pr-12 pl-12 text-control text-ink placeholder:text-ink-subtle focus:border-focus focus:outline-none"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={t("menu.clearSearch")}
              className="pressable absolute top-1/2 right-1 flex size-target -translate-y-1/2 items-center justify-center rounded-full text-ink-muted"
            >
              <X weight="bold" className="size-5" />
            </button>
          ) : null}
        </label>
        {!query && categories.length > 1 ? <CategoryTabs categories={categories} value={category} onChange={setCategory} /> : null}
      </div>

      {stale && !online ? <OfflineNote /> : null}
      {stale && online ? <p className="text-small text-ink-muted">{t("menu.offlineSaved")}</p> : null}

      {items === undefined ? (
        <ScreenSkeleton rows={4} />
      ) : !items.length ? (
        <EmptyState icon={<ForkKnife weight="bold" />} title={t("menu.emptyCatalogTitle")} body={t("menu.emptyCatalogBody")} />
      ) : !filtered.length ? (
        <EmptyState icon={<MagnifyingGlass weight="bold" />} title={t("menu.emptyTitle")} body={t("menu.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-7" aria-live="polite">
          {groups.map(([cat, list]) => (
            <section key={cat} aria-labelledby={`cat-${cat}`} className="flex flex-col gap-3">
              <h2 id={`cat-${cat}`} className="px-1 text-small font-semibold tracking-label text-ink-muted uppercase">
                {t(`menu.category.${cat}`)}
              </h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {list.map((item) => (
                  <MenuCard key={item._id} item={item} content={content} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {items?.length ? (
        <ButtonLink href="/menu/quiz" variant="secondary" size="md" icon={<GraduationCap weight="bold" />} className="self-start">
          {t("quiz.open")}
        </ButtonLink>
      ) : null}
    </div>
  );
}

/** Items new or changed since my last confirmation, and one "I saw it" for all of them (ADR 0022). */
function PendingAcks() {
  const { t, locale } = useLocale();
  const pending = useQuery(api.menu.pendingAcks, {});
  const confirm = useRun(api.menu.confirm);
  const [done, setDone] = useState(false);
  if (pending === undefined) return <ScreenSkeleton rows={3} />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back="/menu" title={t("menu.pendingScreenTitle")} subtitle={t("menu.pendingScreenBody")} />
      {!pending.length && !done ? <EmptyState icon={<Sparkle weight="bold" />} title={t("menu.pendingNoneTitle")} body={t("menu.pendingNoneBody")} /> : null}
      {pending.length ? (
        <Section title={t("menu.pendingList")}>
          <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
            {pending.map((i) => (
              <li key={i._id}>
                <Link href={`/menu/${i._id}`} className="pressable-row hover-surface flex min-h-target-lg items-center gap-3 px-4 py-2.5">
                  <span className="w-16 shrink-0 overflow-hidden rounded-input">
                    <MenuPhoto url={i.photoUrl} alt="" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-ink">{pickLocalized(i.name, locale)}</span>
                    <span className="text-small text-ink-muted">
                      {t(`menu.kinds.${i.kind}`)}, {i.isNew ? t("menu.new") : t("menu.changed")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {pending.length || done ? (
        <AckBanner
          label={t("menu.sawAll", { n: pending.length })}
          confirmedLabel={t("menu.sawAllDone")}
          confirmed={done && !pending.length}
          loading={confirm.busy}
          onConfirm={async () => {
            const r = await confirm.run({ itemIds: pending.map((i) => i._id as Id<"menuItems">) });
            if (r) {
              setDone(true);
              toast(t("menu.confirmedToast"), "ok");
            }
          }}
        />
      ) : null}
    </div>
  );
}
