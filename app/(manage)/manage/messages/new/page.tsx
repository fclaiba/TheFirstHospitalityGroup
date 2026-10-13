"use client";

import { useState } from "react";
import { Check, Megaphone, PaperPlaneTilt } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useCan, useMe, useVenue } from "@/hooks/use-app";
import { ago } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import { AREAS } from "@/lib/domain/types";
import type { Locale, Position } from "@/lib/domain/types";
import { RequireAuth } from "@/components/app/require-auth";
import { ButtonRow, List, PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, Input, SwitchRow, Textarea } from "@/components/ui/field";
import { PhotoField } from "@/components/ui/photo-field";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { StateChip, StatusChip } from "@/components/ui/status";
import { ReceiptsSheet } from "@/components/messages/receipts-sheet";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("pressable inline-flex min-h-target items-center gap-2 rounded-pill border px-4 text-control font-medium", on ? "border-ink bg-ink text-on-ink" : "hover-line border-line-strong bg-canvas text-ink")}
    >
      {on ? <Check weight="bold" className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** What I sent to this venue, each with its receipt state; tap for the names (ADR 0027: names, never a rate). */
function Sent({ venueId }: { venueId: Id<"venues"> }) {
  const { t, locale } = useLocale();
  const list = useQuery(api.messages.sent, { venueId });
  const [open, setOpen] = useState<Id<"messages"> | null>(null);
  if (list === undefined) return <ScreenSkeleton rows={3} />;
  if (!list.length) return <EmptyState icon={<Megaphone weight="bold" />} title={t("announce.noneSent")} />;
  return (
    <>
      <List>
        {list.slice(0, 20).map((m) => (
          <ButtonRow
            key={m._id}
            onClick={() => setOpen(m._id)}
            title={pickLocalized(m.title, locale)}
            subtitle={`${m.senderName}, ${ago(t, m.at)}`}
            trailing={<StateChip state={m.state === "all_done" ? "confirmed" : "pending"} size="sm" />}
          />
        ))}
      </List>
      {open ? <ReceiptsSheet messageId={open} open onOpenChange={(o) => !o && setOpen(null)} /> : null}
    </>
  );
}

/** One-way announcement down the chain (BLUEPRINT 2.6, ADR 0026): no replies, no threads, read receipts. */
function Compose() {
  const { t, locale } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const corporate = useCan("messages.send_all");
  const venues = me?.venues ?? [];
  const positions = useQuery(api.org.positions, venueId ? { venueId } : "skip");
  const [venueIds, setVenueIds] = useState<string[]>(venueId ? [venueId] : []);
  const [picked, setPicked] = useState<Position[]>([]);
  const [lang, setLang] = useState<Locale>(locale);
  const [title, setTitle] = useState({ en: "", es: "" });
  const [body, setBody] = useState({ en: "", es: "" });
  const [confirm, setConfirm] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const send = useRun(api.messages.send, { silent: true });

  const complete = (l: Locale) => !!title[l].trim() && !!body[l].trim();
  const targets = venueIds.length ? venueIds : venueId ? [venueId] : [];
  const ready = targets.length > 0 && complete("en") && complete("es");
  const toggleVenue = (id: string) => setVenueIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const toggle = (p: Position) => setPicked((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]));

  const submit = async () => {
    const r = await send.run({
      venueIds: targets as Id<"venues">[],
      positions: picked.length ? picked : undefined,
      title: { en: title.en.trim(), es: title.es.trim() },
      body: { en: body.en.trim(), es: body.es.trim() },
      requiresConfirmation: confirm,
      photoId: (photoId as Id<"_storage">) ?? undefined,
    });
    if (r) {
      toast(t("announce.sent", { count: r.recipients }), "ok");
      setTitle({ en: "", es: "" });
      setBody({ en: "", es: "" });
      setPicked([]);
      setConfirm(false);
      setPhotoId(null);
      setFormKey((k) => k + 1);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={t("announce.title")} subtitle={t("announce.subtitle")} />
      {corporate && venues.length > 1 ? (
        <Section title={t("messages.venues")}>
          <div className="flex flex-wrap gap-2">
            <Toggle on={venueIds.length === venues.length} onClick={() => setVenueIds(venueIds.length === venues.length ? [] : venues.map((v) => v.id))}>
              {t("messages.allVenues")}
            </Toggle>
            {venues.map((v) => (
              <Toggle key={v.id} on={venueIds.includes(v.id)} onClick={() => toggleVenue(v.id)}>
                {v.name}
              </Toggle>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title={t("messages.audience")}>
        <Toggle on={picked.length === 0} onClick={() => setPicked([])}>
          {t("messages.everyone")}
        </Toggle>
        {positions === undefined ? (
          <ScreenSkeleton rows={2} />
        ) : (
          AREAS.filter((a) => positions.some((p) => p.area === a)).map((area) => (
            <div key={area} className="flex flex-col gap-2">
              <p className="px-1 text-small font-semibold text-ink-muted">{t(`areas.${area}`)}</p>
              <div className="flex flex-wrap gap-2">
                {positions
                  .filter((p) => p.area === area)
                  .map((p) => (
                    <Toggle key={p.position} on={picked.includes(p.position as Position)} onClick={() => toggle(p.position as Position)}>
                      {p.localName ? pickLocalized(p.localName, locale) : t(`positions.${p.position}`)}
                    </Toggle>
                  ))}
              </div>
            </div>
          ))
        )}
      </Section>
      <Section title={t("messages.content")}>
        <Segmented<Locale>
          label={t("common.language")}
          value={lang}
          onChange={setLang}
          options={[
            { value: "en", label: complete("en") ? t("common.english") : `${t("common.english")} *` },
            { value: "es", label: complete("es") ? t("common.spanish") : `${t("common.spanish")} *` },
          ]}
        />
        <div className="flex items-center gap-2">
          {complete("en") && complete("es") ? (
            <StatusChip tone="ok" size="sm">
              {t("messages.bothLanguages")}
            </StatusChip>
          ) : (
            <StatusChip tone="attention" size="sm">
              {t("messages.missingLanguage")}
            </StatusChip>
          )}
        </div>
        <div key={`${lang}-${formKey}`} className="flex flex-col gap-4" lang={lang}>
          <Field label={t("messages.titleLabel")}>{(p) => <Input {...p} maxLength={100} value={title[lang]} onChange={(e) => setTitle({ ...title, [lang]: e.target.value })} />}</Field>
          <Field label={t("messages.bodyLabel")}>{(p) => <Textarea {...p} maxLength={2000} rows={6} value={body[lang]} onChange={(e) => setBody({ ...body, [lang]: e.target.value })} />}</Field>
        </div>
      </Section>
      <Section>
        <div className="rounded-card border border-line bg-surface-raised px-4">
          <SwitchRow label={t("messages.requireConfirm")} help={t("messages.requireConfirmHelp")} checked={confirm} onChange={setConfirm} />
        </div>
        <PhotoField key={formKey} value={photoId} onChange={setPhotoId} purpose="message" compact />
      </Section>
      <p className="px-1 text-small text-ink-muted">{t("announce.oneWay")}</p>
      <InlineError>{send.message}</InlineError>
      <Button block disabled={!ready} loading={send.busy} onClick={() => void submit()} icon={<PaperPlaneTilt weight="bold" className="size-5" />}>
        {t("messages.send")}
      </Button>
      {!ready ? <p className="text-small text-ink-muted">{t("messages.sendHint")}</p> : null}
      {venueId ? (
        <Section title={t("announce.sentTitle")}>
          <Sent venueId={venueId} />
        </Section>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth action="messages.send">
      <Compose />
    </RequireAuth>
  );
}
