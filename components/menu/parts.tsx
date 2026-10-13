"use client";

import Link from "next/link";
import { useState } from "react";
import { Prohibit, Sparkle, Translate, WarningOctagon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import type { Locale, Localized } from "@/lib/domain/types";
import { LionMark } from "@/components/ui/brand";
import { StatusChip } from "@/components/ui/status";

/** A menu item as the staff screens show it. No prices (ADR 0018). */
export type MenuItemView = {
  _id: string;
  kind: string;
  name: Localized;
  description: Localized;
  ingredients: Localized;
  allergens: string[];
  pairing: Localized | null;
  course: number | null;
  category: string;
  tags: string[];
  sort: number;
  active: boolean;
  version: number;
  changedAt: number;
  available: boolean;
  is86: boolean;
  eightySixNote: string | null;
  pendingAck: boolean;
  photoId: string | null;
  photoUrl: string | null;
};

/** Content language for a screen: the UI language by default, the other one a tap away (BLUEPRINT 2.2). */
export function useContentLocale(): [Locale, () => void] {
  const { locale } = useLocale();
  const [override, setOverride] = useState<Locale | null>(null);
  const content = override ?? locale;
  return [content, () => setOverride(content === "en" ? "es" : "en")];
}

export function ContentLangToggle({ content, onToggle }: { content: Locale; onToggle: () => void }) {
  const { t } = useLocale();
  const other = content === "en" ? "es" : "en";
  return (
    <button
      type="button"
      onClick={onToggle}
      lang={other === "es" ? "es" : "en"}
      className="pressable hover-surface inline-flex min-h-target items-center gap-2 rounded-pill border border-line px-3 text-small font-semibold text-ink"
    >
      <Translate weight="bold" className="size-4" aria-hidden />
      {t("menu.viewIn", { language: other === "es" ? t("common.spanish") : t("common.english") })}
    </button>
  );
}

/** Allergens in the review colour, icon plus word, never colour alone (BLUEPRINT 4.2). */
export function AllergenChips({ allergens, size = "md", className }: { allergens: string[]; size?: "sm" | "md"; className?: string }) {
  const { t } = useLocale();
  if (!allergens.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label={t("menu.allergens")}>
      {allergens.map((a) => (
        <li key={a}>
          <StatusChip tone="review" size={size} icon={<WarningOctagon weight="fill" aria-hidden />}>
            {t(`menu.allergen.${a}`)}
          </StatusChip>
        </li>
      ))}
    </ul>
  );
}

export function TagChips({ tags }: { tags: string[] }) {
  const { t } = useLocale();
  const known = tags.filter(Boolean);
  if (!known.length) return null;
  const label = (tag: string) => {
    const key = `menu.tag.${tag}`;
    try {
      return t(key);
    } catch {
      return tag;
    }
  };
  return (
    <ul className="flex flex-wrap gap-1.5">
      {known.map((tag) => (
        <li key={tag}>
          <StatusChip tone="brand" size="sm" icon={false}>
            {label(tag)}
          </StatusChip>
        </li>
      ))}
    </ul>
  );
}

/** 4:3 photo, or a quiet placeholder with the lion so a missing photo never looks broken. */
export function MenuPhoto({ url, alt, className, priority }: { url: string | null; alt: string; className?: string; priority?: boolean }) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className={cn("flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-surface", className)} role="img" aria-label={t("menu.noPhoto")}>
        <LionMark className="size-10 text-martini-200" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- storage URLs are short-lived; photos are compressed on upload
    <img
      src={url}
      alt={alt}
      className={cn("aspect-[4/3] w-full object-cover", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function MenuCard({ item, content }: { item: MenuItemView; content: Locale }) {
  const { t } = useLocale();
  const name = pickLocalized(item.name, content);
  return (
    <li>
      <Link
        href={`/menu/${item._id}`}
        className={cn(
          "pressable hover-line flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface-raised",
        )}
      >
        <div className="relative">
          <MenuPhoto url={item.photoUrl} alt={t("menu.photoOf", { name })} className={cn((!item.available || item.is86) && "grayscale")} />
          <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
            {item.is86 ? (
              <StatusChip tone="review" size="sm" icon={<Prohibit weight="bold" aria-hidden />} className="shadow-card">
                {t("eightySix.badge")}
              </StatusChip>
            ) : !item.available ? (
              <StatusChip tone="neutral" size="sm" icon={<Prohibit weight="bold" aria-hidden />} className="bg-surface-raised shadow-card">
                {t("menu.unavailable")}
              </StatusChip>
            ) : null}
            {item.pendingAck ? (
              <StatusChip tone="attention" size="sm" icon={<Sparkle weight="fill" aria-hidden />} className="shadow-card">
                {item.version === 1 ? t("menu.new") : t("menu.changed")}
              </StatusChip>
            ) : null}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <h3 lang={content} className="text-body leading-snug font-semibold text-ink">
            {name}
          </h3>
          <p lang={content} className="line-clamp-2 text-small text-ink-muted">
            {pickLocalized(item.description, content)}
          </p>
          <AllergenChips allergens={item.allergens} size="sm" className="mt-auto pt-1" />
        </div>
      </Link>
    </li>
  );
}

export function CategoryTabs({ categories, value, onChange }: { categories: string[]; value: string | null; onChange: (c: string | null) => void }) {
  const { t } = useLocale();
  const all: Array<{ key: string | null; label: string }> = [{ key: null, label: t("menu.allCategories") }, ...categories.map((c) => ({ key: c, label: t(`menu.category.${c}`) }))];
  return (
    <div role="group" aria-label={t("menu.categoriesLabel")} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [touch-action:pan-x_pan-y]">
      {all.map((c) => {
        const on = c.key === value;
        return (
          <button
            key={c.key ?? "all"}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.key)}
            className={cn(
              "pressable inline-flex min-h-target shrink-0 snap-start items-center rounded-pill border px-4 text-small font-semibold whitespace-nowrap",
              on ? "border-ink bg-ink text-on-ink" : "hover-line border-line bg-canvas text-ink",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
