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
import type { Locale, NotifyPrefs, Role, Theme, Level } from "@/lib/domain/types";
import { PageHeader, Section, List, ButtonRow } from "@/components/ui/layout";
import { Segmented } from "@/components/ui/choice";
import { SwitchRow } from "@/components/ui/field";
import { ConfirmButton } from "@/components/ui/button";
import { LevelBadge } from "@/components/ui/status";
import { ScreenSkeleton } from "@/components/ui/states";
import { MyRecord } from "@/components/me/my-record";
import { MyPay } from "@/components/me/my-pay";
import { PushSetting } from "@/components/me/push-setting";
import { PasswordSheet } from "@/components/me/password-sheet";

const NOTIFY_KEYS: Array<keyof NotifyPrefs> = ["messages", "warnings", "tasks", "requests"];

/** Me (BLUEPRINT 6.1): my record, my pay, my settings, my tools, sign out. */
export default function MePage() {
  const { t } = useLocale();
  const me = useMe();
  const { venueName } = useVenue();
  const prefs = useRun(api.me.updatePrefs);
  const [pwOpen, setPwOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  if (!me) return <ScreenSkeleton />;
  const role = me.role as Role;
  const tools = toolsFor(role);
  const notify = me.notify as NotifyPrefs;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={me.name}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <LevelBadge level={me.level as Level} label={t(`levels.${me.level}`)} />
            {t(`roles.${me.role}`)}
            {venueName ? `, ${venueName}` : ""}
          </span>
        }
      />

      {role !== "owner" && role !== "dev" ? <MyRecord /> : null}
      <MyPay />

      <Section title={t("me.settings")}>
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
            <p className="text-small font-semibold text-ink">{t("me.theme")}</p>
            <Segmented<Theme>
              label={t("me.theme")}
              value={me.theme as Theme}
              onChange={(theme) => void prefs.run({ theme })}
              options={[
                { value: "system", label: t("me.themeSystem") },
                { value: "light", label: t("me.themeLight") },
                { value: "dark", label: t("me.themeDark") },
              ]}
            />
          </div>
          <SwitchRow label={t("me.largeText")} help={t("me.largeTextHelp")} checked={me.largeText} onChange={(largeText) => void prefs.run({ largeText })} />
        </div>
      </Section>

      <Section title={t("me.notifications")}>
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface-raised px-4">
          <PushSetting />
          {NOTIFY_KEYS.map((k) => (
            <SwitchRow key={k} label={t(`me.notify.${k}`)} checked={notify[k]} onChange={(on) => void prefs.run({ notify: { ...notify, [k]: on } })} />
          ))}
          <p className="py-3 text-small text-ink-muted">{t("me.helpAlways")}</p>
        </div>
      </Section>

      {tools.length ? (
        <Section title={t("me.tools")}>
          <List>
            {tools.map((tool) => (
              <li key={tool.key}>
                <Link href={tool.href} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left transition-colors">
                  <span className="flex-1 truncate text-body font-medium text-ink">{t(`me.tool.${tool.key}`)}</span>
                  <CaretRight weight="bold" aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      <Section title={t("me.account")}>
        <List>
          <ButtonRow title={t("password.changeTitle")} leading={<Key weight="bold" className="size-5" />} onClick={() => setPwOpen(true)} />
          <ButtonRow
            title={t("me.signOutEverywhere")}
            subtitle={t("me.signOutEverywhereHelp")}
            leading={<Devices weight="bold" className="size-5" />}
            disabled={revoking}
            onClick={async () => {
              setRevoking(true);
              const r = await revokeOtherSessions();
              setRevoking(false);
              toast(r.ok ? t("me.signedOutEverywhere") : t(`errors.${r.error ?? "UNKNOWN"}`), r.ok ? "ok" : "error");
            }}
          />
          {PREVIEW ? (
            <li>
              <Link href="/login" className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left">
                <UserSwitch weight="bold" className="size-5 text-ink-muted" aria-hidden />
                <span className="flex-1 text-body font-medium text-ink">{t("me.switchDemo")}</span>
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
        <ConfirmButton block confirmLabel={t("me.signOutConfirm")} icon={<SignOut weight="bold" className="size-5" />} onConfirm={() => signOut()}>
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
