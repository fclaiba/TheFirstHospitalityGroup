"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Buildings,
  ChatsCircle,
  ClipboardText,
  CookingPot,
  ForkKnife,
  GearSix,
  HandCoins,
  House,
  ListChecks,
  Receipt,
  SealWarning,
  UsersThree,
  Wine,
  Storefront,
  CaretDown,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { HREF, tabsFor } from "@/lib/nav";
import type { NavKey } from "@/lib/nav";
import type { Role } from "@/lib/domain/types";
import { LionMark } from "@/components/ui/brand";
import { useMe, useVenue } from "@/hooks/use-app";
import { useQuery } from "@/lib/backend/hooks";
import { api } from "@/convex/_generated/api";
import { OfflineBanner } from "./offline-banner";
import { VenueSwitcher } from "./venue-switcher";
import { RequestButton } from "@/components/floor/request-button";

const ICONS: Record<NavKey, typeof House> = {
  today: House,
  tasks: ListChecks,
  menu: ForkKnife,
  floor: Storefront,
  kitchen: CookingPot,
  inventory: Wine,
  messages: ChatsCircle,
  manage: ClipboardText,
  requests: Bell,
  team: UsersThree,
  close: Receipt,
  warnings: SealWarning,
  owner: Buildings,
  pay: HandCoins,
  settings: GearSix,
};

const NAV_LABEL: Record<NavKey, string> = {
  today: "today",
  tasks: "tasks",
  menu: "menu",
  floor: "floor",
  kitchen: "kitchen",
  inventory: "inventory",
  messages: "messages",
  manage: "manage",
  requests: "requests",
  team: "team",
  close: "close",
  warnings: "warnings",
  owner: "owner",
  pay: "pay",
  settings: "settings",
};

function isActive(pathname: string, href: string) {
  if (href === "/manage" || href === "/owner") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function VenueTitle({ name, role }: { name: string; role: string }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-body font-semibold text-ink">{name}</span>
      {role ? <span className="truncate text-caption text-ink-muted">{role}</span> : null}
    </span>
  );
}

/**
 * The signed-in shell (BLUEPRINT 4.2, 4.4): a translucent header and tab bar that content scrolls under, safe areas,
 * 100dvh, the floating Request button on staff screens. One primary action per screen lives in the page itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const me = useMe();
  const { venueName, venues } = useVenue();
  const [switcher, setSwitcher] = useState(false);
  const unread = useQuery(api.messages.unreadCount, me ? {} : "skip");
  const role = (me?.role ?? "server") as Role;
  const tabs = tabsFor(role);

  return (
    <div className="app-shell flex flex-col">
      <header className="material sticky top-0 z-30 border-b border-line/70 pt-(--safe-top) no-print">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-3">
          <Link href={HREF[tabs[0]!]} aria-label={t("brand.name")} className="pressable flex size-target items-center justify-center rounded-control text-brand">
            <LionMark className="size-8 text-brand" min />
          </Link>
          {venues.length > 1 ? (
            <button
              type="button"
              onClick={() => setSwitcher(true)}
              className="pressable flex min-h-target min-w-0 flex-1 items-center gap-1 rounded-control px-1 text-left"
              aria-label={`${t("common.chooseVenue")}: ${venueName}`}
            >
              <VenueTitle name={venueName || t("brand.company")} role={me ? t(`roles.${me.role}`) : ""} />
              <CaretDown weight="bold" className="size-4 shrink-0 text-ink-muted" aria-hidden />
            </button>
          ) : (
            <div className="flex min-h-target min-w-0 flex-1 items-center px-1">
              <VenueTitle name={venueName || t("brand.company")} role={me ? t(`roles.${me.role}`) : ""} />
            </div>
          )}
          <Link href="/messages" aria-label={t("nav.messages")} className="pressable hover-surface relative flex size-target items-center justify-center rounded-full text-ink">
            <ChatsCircle weight="regular" className="size-6" aria-hidden />
            {unread ? (
              <span className="absolute top-1.5 right-1 min-w-5 rounded-pill bg-review-fg px-1.5 text-center font-mono text-caption font-semibold text-on-ink" aria-label={`${unread}`}>
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
          <Link href="/me" aria-label={t("nav.me")} className="pressable flex size-target items-center justify-center rounded-full">
            <span className="flex size-9 items-center justify-center rounded-full bg-ink text-small font-semibold text-on-ink">{me ? initials(me.name) : ""}</span>
          </Link>
        </div>
      </header>
      <OfflineBanner />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-3 pb-[calc(var(--nav-height)+6rem+var(--safe-bottom))]">
        {children}
      </main>
      <RequestButton />
      <nav aria-label={t("nav.mainNav")} className="material fixed inset-x-0 bottom-0 z-30 border-t border-line/70 pb-(--safe-bottom) no-print">
        <ul className="mx-auto grid h-(--nav-height) max-w-3xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((key) => {
            const href = HREF[key];
            const on = isActive(pathname, href);
            const Icon = ICONS[key];
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cn("pressable flex h-full flex-col items-center justify-center gap-0.5 text-caption font-semibold", on ? "text-brand" : "hover-ink text-ink-muted")}
                >
                  <Icon weight={on ? "fill" : "regular"} className="size-6" aria-hidden />
                  <span>{t(`nav.${NAV_LABEL[key]}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <VenueSwitcher open={switcher} onOpenChange={setSwitcher} />
    </div>
  );
}

