"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowCounterClockwise, CaretRight, Devices, Key, SignOut, UserSwitch } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useMe, useVenue } from "@/hooks/use-app";
import { toolsFor } from "@/lib/nav";
import { PREVIEW } from "@/lib/backend/config";
import { revokeOtherSessions, signOut } from "@/lib/auth/client";
import { reseed } from "@/lib/demo/store";
import { toast } from "@/lib/toast";
import type { Locale, NotifyPrefs, Position, Theme } from "@/lib/domain/types";
import { PageHeader, Section, List, ButtonRow } from "@/components/ui/layout";
import { Segmented } from "@/components/ui/choice";
import { SwitchRow } from "@/components/ui/field";
import { ConfirmButton } from "@/components/ui/button";
import { PositionBadge } from "@/components/ui/status";
import { ScreenSkeleton } from "@/components/ui/states";
import { MyRecord } from "@/components/me/my-record";
import { PositionHistory } from "@/components/me/position-history";
import { PushSetting } from "@/components/me/push-setting";
import { PasswordSheet } from "@/components/me/password-sheet";

const NOTIFY_KEYS: Array<keyof NotifyPrefs> = ["schedule", "messages", "warnings", "tasks", "requests"];

/** Me (BLUEPRINT 6.1): my warnings and state, my position history, my settings, my tools, sign out. No pay (ADR 0018). */
export default function MePage() {
  const { t } = useLocale();
  const me = useMe();
  const { venueName } = useVenue();
  const prefs = useRun(api.me.updatePrefs);
  const [pwOpen, setPwOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  if (!me) return <ScreenSkeleton />;
  const position = me.position as Position;
  const tools = toolsFor(position, me.primaryPosition as Position);
  const notify = me.notify as NotifyPrefs;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={me.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PositionBadge position={position} />
            {me.title ? <span>{me.title}</span> : null}
            {venueName ? <span>{venueName}</span> : null}
          </span>
        }
      />

      {!me.isCorporate ? <MyRecord /> : null}
      {!me.isCorporate ? <PositionHistory /> : null}

      <Section title={t("mine.settings")}>
        <div className="flex flex-col gap-5 rounded-card border border-line bg-surface-raised p-4">
          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold text-ink">{t("common.language")}</p>
            <Segmented<Locale>
              label={t("common.language")}
              value={me.locale as Locale}
              onChange={(locale) => void prefs.run({ locale })}
              options={[
                { value: "en", label: t("common.english") },
                { value: "es", label: t("common.spanish") },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold text-ink">{t("mine.theme")}</p>
            <Segmented<Theme>
              label={t("mine.theme")}
              value={me.theme as Theme}
              onChange={(theme) => void prefs.run({ theme })}
              options={[
                { value: "light", label: t("mine.themeLight") },
                { value: "dark", label: t("mine.themeDark") },
                { value: "system", label: t("mine.themeSystem") },
              ]}
            />
          </div>
          <SwitchRow label={t("mine.largeText")} help={t("mine.largeTextHelp")} checked={me.largeText} onChange={(largeText) => void prefs.run({ largeText })} />
        </div>
      </Section>

      <Section title={t("mine.notifications")}>
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface-raised px-4">
          <PushSetting />
          {NOTIFY_KEYS.map((k) => (
            <SwitchRow key={k} label={t(`mine.notify.${k}`)} checked={notify[k]} onChange={(on) => void prefs.run({ notify: { ...notify, [k]: on } })} />
          ))}
          <p className="py-3 text-small text-ink-muted">{t("mine.helpAlways")}</p>
        </div>
      </Section>

      {tools.length ? (
        <Section title={t("mine.tools")}>
          <List>
            {tools.map((tool) => (
              <li key={tool.key}>
                <Link href={tool.href} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left transition-colors">
                  <span className="flex-1 truncate text-body font-medium text-ink">{t(`mine.tool.${tool.key}`)}</span>
                  <CaretRight weight="bold" aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      <Section title={t("mine.account")}>
        <List>
          <ButtonRow title={t("password.changeTitle")} leading={<Key weight="bold" className="size-5" />} onClick={() => setPwOpen(true)} />
          <ButtonRow
            title={t("mine.signOutEverywhere")}
            subtitle={t("mine.signOutEverywhereHelp")}
            leading={<Devices weight="bold" className="size-5" />}
            disabled={revoking}
            onClick={async () => {
              setRevoking(true);
              const r = await revokeOtherSessions();
              setRevoking(false);
              toast(r.ok ? t("mine.signedOutEverywhere") : t(`errors.${r.error ?? "UNKNOWN"}`), r.ok ? "ok" : "error");
            }}
          />
          {PREVIEW ? (
            <li>
              <Link href="/login" className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left">
                <UserSwitch weight="bold" className="size-5 text-ink-muted" aria-hidden />
                <span className="flex-1 text-body font-medium text-ink">{t("mine.switchDemo")}</span>
              </Link>
            </li>
          ) : null}
          {PREVIEW ? (
            <ButtonRow
              title={t("login.demoReset")}
              leading={<ArrowCounterClockwise weight="bold" className="size-5" />}
              onClick={() => void reseed(true).then(() => toast(t("login.demoResetDone"), "ok"))}
            />
          ) : null}
        </List>
        <ConfirmButton block confirmLabel={t("mine.signOutConfirm")} icon={<SignOut weight="bold" className="size-5" />} onConfirm={() => signOut()}>
          {t("common.signOut")}
        </ConfirmButton>
        <p className="px-1 text-caption text-ink-subtle">
          <Link href="/legal/privacy" className="underline underline-offset-4">
            {t("legal.privacy")}
          </Link>
        </p>
      </Section>
      <PasswordSheet open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
