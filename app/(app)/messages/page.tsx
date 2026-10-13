"use client";

import { ChatsCircle, PencilSimple } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { useCan } from "@/hooks/use-app";
import { PageHeader, Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { MessageRow } from "@/components/messages/message-row";

/** Announcements (BLUEPRINT 2.6): one way, down the chain; unread and to-confirm first. No replies or threads (ADR 0026). */
export default function Inbox() {
  const { t } = useLocale();
  const canSend = useCan("messages.send");
  const inbox = useQuery(api.messages.inbox, {});
  const pending = (inbox ?? []).filter((m) => !m.readAt || (m.requiresConfirmation && !m.confirmedAt));
  const rest = (inbox ?? []).filter((m) => !pending.includes(m));
  return (
    <>
      <PageHeader
        title={t("messages.title")}
        action={
          canSend ? (
            <ButtonLink href="/manage/messages/new" size="md" variant="secondary" icon={<PencilSimple weight="bold" className="size-5" />}>
              {t("messages.compose")}
            </ButtonLink>
          ) : null
        }
      />
      {inbox === undefined ? (
        <ScreenSkeleton />
      ) : inbox.length === 0 ? (
        <EmptyState icon={<ChatsCircle weight="bold" />} title={t("messages.emptyTitle")} body={t("messages.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-6">
          {pending.length ? (
            <Section title={t("messages.new")}>
              <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
                {pending.map((m) => (
                  <MessageRow key={m._id} m={m} />
                ))}
              </ul>
            </Section>
          ) : null}
          {rest.length ? (
            <Section title={t("messages.earlier")}>
              <ul className="overflow-hidden rounded-card border border-line bg-surface-raised [&>li+li]:border-t [&>li+li]:border-line">
                {rest.map((m) => (
                  <MessageRow key={m._id} m={m} />
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </>
  );
}
