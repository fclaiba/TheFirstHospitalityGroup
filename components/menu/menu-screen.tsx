"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ForkKnife, MagnifyingGlass, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { useT } from "@/lib/i18n-client";
import { PageHeader } from "@/components/ui/layout";
import { EmptyState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import { CategoryTabs, ContentLangToggle, MenuCard, useContentLocale } from "./parts";
import type { MenuItemView } from "./parts";
import { useMenuWithCache } from "./cache";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Menu (BLUEPRINT 2.2): instant search over both languages, category chips, cards with photo and allergens. */
export function MenuScreen() {
  const t = useT();
  const online = useOnline();
  const { venueId } = useVenue();
  const live = useQuery(api.menu.list, venueId ? { venueId } : "skip") as MenuItemView[] | undefined;
  const { items, stale } = useMenuWithCache(venueId, live);
  const [content, toggleContent] = useContentLocale();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const query = useDeferredValue(q);

  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items]);
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    return (items ?? []).filter((i) => {
      if (category && i.category !== category) return false;
      if (!needle) return true;
      const hay = fold([i.name.en, i.name.es, i.description.en, i.description.es, i.ingredients.en, i.ingredients.es, ...i.tags, ...i.allergens].join(" "));
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [items, query, category]);

  const groups = useMemo(() => {
    const out = new Map<string, MenuItemView[]>();
    for (const i of filtered) out.set(i.category, [...(out.get(i.category) ?? []), i]);
    return [...out.entries()];
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("menu.title")} subtitle={t("menu.subtitle")} action={<ContentLangToggle content={content} onToggle={toggleContent} />} />
      <div className="material sticky top-[calc(3.5rem+var(--safe-top))] z-20 -mx-4 flex flex-col gap-3 px-4 pt-1 pb-3">
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
        {categories.length > 1 ? <CategoryTabs categories={categories} value={category} onChange={setCategory} /> : null}
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
              <h2 id={`cat-${cat}`} className="flex items-baseline justify-between px-1 text-small font-semibold tracking-label text-ink-muted uppercase">
                {t(`menu.category.${cat}`)}
                <span className="font-mono text-caption tracking-normal normal-case">{t("menu.count", { n: list.length })}</span>
              </h2>
              <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3">
                {list.map((item) => (
                  <MenuCard key={item._id} item={item} content={content} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {query ? t("menu.count", { n: filtered.length }) : ""}
      </span>
    </div>
  );
}
