"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useMe, useVenue } from "@/hooks/use-app";
import { STAFF_ROLES } from "@/lib/domain/types";
import type { Locale, Role } from "@/lib/domain/types";
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { Field, Input, SwitchRow, Textarea } from "@/components/ui/field";
import { PhotoField } from "@/components/ui/photo-field";
import { InlineError } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
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

/** Compose (BLUEPRINT 2.2): audience, EN and ES with a completeness badge, confirmation, photo, preview, send. */
function Compose() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const me = useMe();
  const { venueId } = useVenue();
  const venues = me?.venues ?? [];
  const [venueIds, setVenueIds] = useState<string[]>(venueId ? [venueId] : []);
  const [roles, setRoles] = useState<Role[]>([]);
  const [lang, setLang] = useState<Locale>(locale);
  const [title, setTitle] = useState({ en: "", es: "" });
  const [body, setBody] = useState({ en: "", es: "" });
  const [confirm, setConfirm] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const send = useRun(api.messages.send, { silent: true });

  const complete = (l: Locale) => !!title[l].trim() && !!body[l].trim();
  const targets = venueIds.length ? venueIds : venueId ? [venueId] : [];
  const ready = targets.length > 0 && complete("en") && complete("es");
  const toggleVenue = (id: string) => setVenueIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const toggleRole = (r: Role) => setRoles((v) => (v.includes(r) ? v.filter((x) => x !== r) : [...v, r]));

  const submit = async () => {
    const r = await send.run({
      venueIds: targets as Id<"venues">[],
      roles: roles.length ? roles : undefined,
      title: { en: title.en.trim(), es: title.es.trim() },
      body: { en: body.en.trim(), es: body.es.trim() },
      requiresConfirmation: confirm,
      photoId: (photoId as Id<"_storage">) ?? undefined,
    });
    if (r) router.replace(`/messages/${r.messageId}`);
  };

  return (
    <>
      <PageHeader title={t("messages.composeTitle")} back="/messages" />
      <div className="flex flex-col gap-7">
        {venues.length > 1 ? (
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
          <div className="flex flex-wrap gap-2">
            <Toggle on={roles.length === 0} onClick={() => setRoles([])}>
              {t("messages.everyone")}
            </Toggle>
            {[...STAFF_ROLES, "manager" as const].map((r) => (
              <Toggle key={r} on={roles.includes(r)} onClick={() => toggleRole(r)}>
                {t(`roles.${r}`)}
              </Toggle>
            ))}
          </div>
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
          <div key={lang} className="flex flex-col gap-4" lang={lang}>
            <Field label={t("messages.titleLabel")}>{(p) => <Input {...p} maxLength={100} value={title[lang]} onChange={(e) => setTitle({ ...title, [lang]: e.target.value })} />}</Field>
            <Field label={t("messages.bodyLabel")}>{(p) => <Textarea {...p} maxLength={2000} rows={6} value={body[lang]} onChange={(e) => setBody({ ...body, [lang]: e.target.value })} />}</Field>
          </div>
        </Section>
        <Section>
          <div className="rounded-card border border-line bg-surface-raised px-4">
            <SwitchRow label={t("messages.requireConfirm")} help={t("messages.requireConfirmHelp")} checked={confirm} onChange={setConfirm} />
          </div>
          <PhotoField value={photoId} onChange={setPhotoId} purpose="message" compact />
        </Section>
        {title[lang] || body[lang] ? (
          <Section title={t("messages.preview")}>
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-body font-bold text-ink">{title[lang]}</p>
              <p className="mt-1 text-body whitespace-pre-line text-ink">{body[lang]}</p>
            </div>
          </Section>
        ) : null}
        <InlineError>{send.message}</InlineError>
        <Button block disabled={!ready} loading={send.busy} onClick={() => void submit()} icon={<PaperPlaneTilt weight="bold" className="size-5" />}>
          {t("messages.send")}
        </Button>
        {!ready ? <p className="text-small text-ink-muted">{t("messages.sendHint")}</p> : null}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="messages.send">
      <Compose />
    </RequireAuth>
  );
}
