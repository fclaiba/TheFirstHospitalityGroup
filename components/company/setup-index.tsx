"use client";

import type { ReactNode } from "react";
import { Buildings, CalendarStar, ClockCounterClockwise, DownloadSimple, ForkKnife, HandCoins, Ruler, Scroll, SquaresFour, Stack, TreeStructure } from "@phosphor-icons/react";
import { useLocale } from "@/lib/i18n-client";
import { useMe, canDo } from "@/hooks/use-app";
import type { Action } from "@/lib/domain/permissions";
import { LinkRow, List, PageHeader } from "@/components/ui/layout";
import { ScreenSkeleton } from "@/components/ui/states";

const ITEMS: Array<{ key: string; href: string; action: Action; icon: ReactNode }> = [
  { key: "venues", href: "/company/setup/venues", action: "company.setup", icon: <Buildings weight="bold" className="size-6" /> },
  { key: "areas", href: "/company/setup/areas", action: "company.view", icon: <Stack weight="bold" className="size-6" /> },
  { key: "positions", href: "/company/setup/positions", action: "company.setup", icon: <TreeStructure weight="bold" className="size-6" /> },
  { key: "floorPlans", href: "/company/setup/floor-plans", action: "floor.plans", icon: <SquaresFour weight="bold" className="size-6" /> },
  { key: "menu", href: "/company/setup/menu", action: "menu.edit", icon: <ForkKnife weight="bold" className="size-6" /> },
  { key: "rules", href: "/company/setup/rules", action: "rules.company", icon: <Scroll weight="bold" className="size-6" /> },
  { key: "events", href: "/company/setup/events", action: "events.manage", icon: <CalendarStar weight="bold" className="size-6" /> },
  { key: "thresholds", href: "/company/setup/thresholds", action: "warnings.thresholds", icon: <Ruler weight="bold" className="size-6" /> },
  { key: "tipPolicy", href: "/company/setup/tip-policy", action: "tips.manage", icon: <HandCoins weight="bold" className="size-6" /> },
  { key: "import", href: "/company/setup/import", action: "import.run", icon: <DownloadSimple weight="bold" className="size-6" /> },
  { key: "audit", href: "/company/setup/audit", action: "audit.read", icon: <ClockCounterClockwise weight="bold" className="size-6" /> },
];

/** Company setup (BLUEPRINT 2.6 "Owner setup"): the owner sees everything; the director rules, events and thresholds. */
export function SetupIndex() {
  const { t } = useLocale();
  const me = useMe();
  if (!me) return <ScreenSkeleton rows={6} />;
  const items = ITEMS.filter((i) => canDo(me, i.action));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("company.setup.title")} subtitle={t("company.setup.subtitle")} back="/company" />
      <List>
        {items.map((i) => (
          <LinkRow key={i.key} href={i.href} leading={i.icon} title={t(`company.setup.${i.key}`)} subtitle={t(`company.setup.${i.key}Hint`)} />
        ))}
      </List>
    </div>
  );
}
