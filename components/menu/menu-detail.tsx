"use client";

import { useEffect, useRef } from "react";
import { Prohibit, WarningOctagon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useCan, useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { PageHeader, Section } from "@/components/ui/layout";
import { SwitchRow } from "@/components/ui/field";
import { EmptyState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { AllergenChips, ContentLangToggle, MenuPhoto, TagChips, useContentLocale } from "./parts";
import type { MenuItemView } from "./parts";
import { readMenu } from "./cache";

/** Dish detail (BLUEPRINT 2.2): 4:3 photo, allergens first, the other language one tap away. */
export function MenuDetail({ itemId }: { itemId: string }) {
  const { t, locale } = useLocale();
  const online = useOnline();
  const { venueId, venueName } = useVenue();
  const canToggle = useCan("menu.availability");
  const live = useQuery(api.menu.get, venueId ? { itemId: itemId as Id<"menuItems">, venueId } : "skip") as MenuItemView | undefined;
  const cached = venueId && !live ? (readMenu(venueId)?.find((i) => i._id === itemId) ?? null) : null;
  const item = live ?? cached ?? undefined;
  const [content, toggleContent] = useContentLocale();
  const viewed = useMutation(api.menu.viewed);
  const sent = useRef(false);
  const availability = useRun(api.menu.setAvailability);

  useEffect(() => {
    if (!venueId || sent.current || !live) return;
    sent.current = true;
    void viewed({ itemId: itemId as Id<"menuItems">, venueId }).catch(() => undefined);
  }, [venueId, itemId, live, viewed]);

  if (item === undefined) {
    if (!online) return <EmptyState title={t("errors.NOT_FOUND")} body={t("common.offline")} />;
    return <ScreenSkeleton rows={3} />;
  }

  const name = pickLocalized(item.name, content);
  const description = pickLocalized(item.description, content);
  const ingredients = pickLocalized(item.ingredients, content);

  return (
    <article className="flex flex-col gap-5">
      <PageHeader back="/menu" title={name} eyebrow={t(`menu.category.${item.category}`)} action={<ContentLangToggle content={content} onToggle={toggleContent} />} />
      {!live ? <OfflineNote /> : null}
      <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-card">
        <MenuPhoto url={item.photoUrl} alt={t("menu.photoOf", { name })} priority className={item.available ? undefined : "grayscale"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-small text-ink-muted">{item.priceOverridden ? t("menu.venuePrice") : t("menu.price")}</span>
          <span className="font-mono text-figure font-semibold text-ink tabular">{money(locale, item.priceCents)}</span>
        </div>
        {item.available ? (
          <StatusChip tone="ok">{t("menu.available")}</StatusChip>
        ) : (
          <StatusChip tone="neutral" icon={<Prohibit weight="bold" aria-hidden />}>
            {t("menu.unavailable")}
          </StatusChip>
        )}
      </div>

      <Section title={t("menu.allergens")}>
        <div className="flex flex-col gap-3 rounded-card bg-review-bg p-4">
          {item.allergens.length ? <AllergenChips allergens={item.allergens} /> : <p className="text-body font-semibold text-ink">{t("menu.noAllergens")}</p>}
          <p className="flex items-start gap-2 text-small font-medium text-review-fg">
            <WarningOctagon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("menu.allergenWarning")}
          </p>
        </div>
      </Section>

      {description ? (
        <Section title={t("menu.description")}>
          <p lang={content} className="px-1 text-lead text-ink">
            {description}
          </p>
        </Section>
      ) : null}
      {ingredients ? (
        <Section title={t("menu.ingredients")}>
          <p lang={content} className="px-1 text-body text-ink">
            {ingredients}
          </p>
        </Section>
      ) : null}
      {item.tags.length ? (
        <Section title={t("menu.tags")}>
          <div className="px-1">
            <TagChips tags={item.tags} />
          </div>
        </Section>
      ) : null}

      {canToggle && venueId && live ? (
        <Section title={venueName}>
          <div className="rounded-card border border-line px-4">
            <SwitchRow
              label={t("menu.availabilityToggle")}
              help={t("menu.availabilityHelp")}
              checked={item.available}
              disabled={availability.busy}
              onChange={(available) =>
                void availability
                  .run({ itemId: item._id as Id<"menuItems">, venueId, available })
                  .then((r) => r && toast(available ? t("menu.markedIn") : t("menu.markedOut"), "ok"))
              }
            />
          </div>
        </Section>
      ) : null}
    </article>
  );
}
