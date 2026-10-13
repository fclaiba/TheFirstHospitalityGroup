"use client";

import { use, useEffect, useRef, useState } from "react";
import { Translate, UsersThree } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateLong, time } from "@/lib/format";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/components/ui/states";
import { StoredPhoto } from "@/components/ui/photo-field";
import { ReceiptsSheet } from "@/components/messages/receipts-sheet";
import { AckBanner } from "@/components/app/confirm";
import type { Locale } from "@/lib/domain/types";

/** An announcement in my language, the other one tap away; "I saw it" when confirmation is required. One way: no replies (ADR 0026). */
export default function MessageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useLocale();
  const messageId = id as Id<"messages">;
  const m = useQuery(api.messages.get, { messageId });
  const markRead = useMutation(api.messages.markRead);
  const confirm = useRun(api.messages.confirm, { success: t("messages.confirmDone") });
  const [lang, setLang] = useState<Locale>(locale);
  const [receipts, setReceipts] = useState(false);
  const marked = useRef(false);

  useEffect(() => {
    if (m && m.isRecipient && !m.readAt && !marked.current) {
      marked.current = true;
      void markRead({ messageId }).catch(() => undefined);
    }
  }, [m, markRead, messageId]);

  if (m === undefined) return <ScreenSkeleton rows={3} />;
  const other: Locale = lang === "en" ? "es" : "en";
  const hasOther = !!m.title[other]?.trim();

  return (
    <article className="flex flex-col gap-5">
      <PageHeader back="/messages" title={m.title[lang] || m.title[other]} subtitle={`${m.senderName}, ${dateLong(locale, m.at)} ${time(locale, m.at)}`} />
      <p lang={lang === "es" ? "es" : "en"} className="text-lead whitespace-pre-line text-ink">
        {m.body[lang] || m.body[other]}
      </p>
      {m.photoId ? <StoredPhoto storageId={m.photoId} alt={t("common.photo")} className="aspect-[4/3] w-full rounded-card" /> : null}
      {hasOther ? (
        <button type="button" onClick={() => setLang(other)} className="pressable inline-flex min-h-target w-fit items-center gap-2 rounded-pill bg-surface px-4 text-small font-semibold text-ink">
          <Translate weight="bold" className="size-5" aria-hidden />
          {other === "es" ? t("messages.readInSpanish") : t("messages.readInEnglish")}
        </button>
      ) : null}
      {m.isRecipient && m.requiresConfirmation ? (
        <AckBanner
          label={t("messages.iReadIt")}
          confirmedLabel={m.confirmedAt ? t("messages.youConfirmed", { time: time(locale, m.confirmedAt) }) : t("confirm.confirmed")}
          confirmed={!!m.confirmedAt}
          loading={confirm.busy}
          onConfirm={() => void confirm.run({ messageId })}
        />
      ) : null}
      {m.canSeeReceipts ? (
        <Button variant="secondary" icon={<UsersThree weight="bold" className="size-5" />} onClick={() => setReceipts(true)} className="self-start">
          {t("messages.receipts")}
        </Button>
      ) : null}
      {m.canSeeReceipts ? <ReceiptsSheet messageId={messageId} open={receipts} onOpenChange={setReceipts} /> : null}
    </article>
  );
}
