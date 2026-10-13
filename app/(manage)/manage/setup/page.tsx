"use client";

import { BookOpenText, ForkKnife, IdentificationCard, ListChecks, MapTrifold } from "@phosphor-icons/react";
import { RequireAuth } from "@/components/app/require-auth";
import { LinkRow, List, PageHeader, Section } from "@/components/ui/layout";
import { useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";

/** Setup hub (BLUEPRINT 6.1 /manage/setup): every catalog a manager keeps for the venue. */
function SetupHub() {
  const t = useT();
  const { venueName } = useVenue();
  const rows = [
    { href: "/manage/setup/staff", icon: IdentificationCard, key: "staff" },
    { href: "/manage/setup/tasks", icon: ListChecks, key: "tasks" },
    { href: "/manage/setup/rules", icon: BookOpenText, key: "rules" },
    { href: "/manage/setup/sections", icon: MapTrifold, key: "sections" },
    { href: "/manage/setup/menu-availability", icon: ForkKnife, key: "menu" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={venueName} title={t("manage.setup.title")} subtitle={t("manage.setup.subtitle")} />
      <Section>
        <List>
          {rows.map(({ href, icon: Icon, key }) => (
            <LinkRow key={key} href={href} leading={<Icon weight="bold" className="size-5" />} title={t(`manage.setup.${key}`)} subtitle={t(`manage.setup.${key}Help`)} />
          ))}
        </List>
      </Section>
    </div>
  );
}

export default function SetupPage() {
  return (
    <RequireAuth action="tasks.templates">
      <SetupHub />
    </RequireAuth>
  );
}
