"use client";

import { useEffect, useRef, useState } from "react";
import { PencilSimple, Prohibit, WarningOctagon, Wine } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { toast } from "@/lib/toast";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/field";
import { EmptyState, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { AckBanner } from "@/components/app/confirm";
import { AllergenChips, ContentLangToggle, MenuPhoto, TagChips, useContentLocale } from "./parts";
import type { MenuItemView } from "./parts";
import { readMenu } from "./cache";
import { ItemSheet } from "./menu-editor";

/**
 * Item detail (BLUEPRINT 2.6): 4:3 photo, allergens first, pairing, the 86 of tonight, the other language one tap
 * away, and "I saw it" when the item is new or changed for me (ADR 0022). No price (ADR 0018).
 */
export function MenuDetail({ itemId }: { itemId: string }) {
  const { t } = useLocale();
  const me = useMe();
  const online = useOnline();
  const { venueId, venueName } = useVenue();
  const live = useQuery(api.menu.get, venueId ? { itemId: itemId as Id<"menuItems">, venueId } : "skip") as MenuItemView | undefined;
  const cached = venueId && !live ? (readMenu(venueId)?.find((i) => i._id === itemId) ?? null) : null;
  const item = live ?? cached ?? undefined;
  const [content, toggleContent] = useContentLocale();
  const viewed = useMutation(api.menu.viewed);
  const sent = useRef(false);
  const availability = useRun(api.menu.setAvailability);
  const confirm = useRun(api.menu.confirm);
  const [confirmed, setConfirmed] = useState(false);
  const [sheet, setSheet] = useState<"edit" | "propose" | null>(null);

  useEffect(() => {
    if (sent.current || !live) return;
    sent.current = true;
    void viewed({ itemId: itemId as Id<"menuItems"> }).catch(() => undefined);
  }, [itemId, live, viewed]);

  if (item === undefined) {
    if (!online) return <EmptyState title={t("errors.NOT_FOUND")} body={t("common.offline")} />;
    return <ScreenSkeleton rows={3} />;
  }

  const name = pickLocalized(item.name, content);
  const description = pickLocalized(item.description, content);
  const ingredients = pickLocalized(item.ingredients, content);
  const pairing = item.pairing ? pickLocalized(item.pairing, content) : "";
  const canEdit = canDo(me, "menu.edit") && (me?.isCorporate || item.kind === "food");
  const canPropose = canDo(me, "menu.propose") && item.kind !== "food";

  return (
    <article className="flex flex-col gap-5">
      <PageHeader back="/menu" title={name} eyebrow={t(`menu.category.${item.category}`)} action={<ContentLangToggle content={content} onToggle={toggleContent} />} />
      {!live ? <OfflineNote /> : null}
      <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-card">
        <MenuPhoto url={item.photoUrl} alt={t("menu.photoOf", { name })} priority className={item.available && !item.is86 ? undefined : "grayscale"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.is86 ? (
          <StatusChip tone="review" icon={<Prohibit weight="bold" aria-hidden />}>
            {t("eightySix.badge")}
            {item.eightySixNote ? `: ${item.eightySixNote}` : ""}
          </StatusChip>
        ) : item.available ? (
          <StatusChip tone="ok">{t("menu.available")}</StatusChip>
        ) : (
          <StatusChip tone="neutral" icon={<Prohibit weight="bold" aria-hidden />}>
            {t("menu.unavailable")}
          </StatusChip>
        )}
        <StatusChip tone="neutral" icon={false} size="sm">
          {t(`menu.kinds.${item.kind}`)}
        </StatusChip>
        {item.course ? (
          <StatusChip tone="neutral" icon={false} size="sm">
            {t("menu.course", { n: item.course })}
          </StatusChip>
        ) : null}
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
      {pairing ? (
        <Section title={t("menu.pairing")}>
          <p lang={content} className="flex items-start gap-2 px-1 text-body text-ink">
            <Wine weight="bold" className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
            {pairing}
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

      {live && (item.pendingAck || confirmed) ? (
        <AckBanner
          label={item.version === 1 ? t("menu.sawNew") : t("menu.sawChange")}
          confirmedLabel={t("menu.sawDone")}
          confirmed={confirmed}
          loading={confirm.busy}
          onConfirm={async () => {
            const r = await confirm.run({ itemIds: [item._id as Id<"menuItems">] });
            if (r) setConfirmed(true);
          }}
        />
      ) : null}

      {canEdit || canPropose ? (
        <Button variant="secondary" icon={<PencilSimple weight="bold" />} onClick={() => setSheet(canEdit ? "edit" : "propose")} className="self-start">
          {canEdit ? t("menuEditor.edit") : t("menuEditor.proposeChange")}
        </Button>
      ) : null}

      {canDo(me, "menu.availability") && venueId && live ? (
        <Section title={venueName}>
          <div className="rounded-card border border-line px-4">
            <SwitchRow
              label={t("menu.availabilityToggle")}
              help={t("menu.availabilityHelp")}
              checked={item.available}
              disabled={availability.busy}
              onChange={(available) =>
                void availability.run({ itemId: item._id as Id<"menuItems">, venueId, available }).then((r) => r && toast(available ? t("menu.markedIn") : t("menu.markedOut"), "ok"))
              }
            />
          </div>
        </Section>
      ) : null}
      {sheet ? <ItemSheet item={item} mode={sheet} corporate={!!me?.isCorporate} onClose={() => setSheet(null)} /> : null}
    </article>
  );
}
