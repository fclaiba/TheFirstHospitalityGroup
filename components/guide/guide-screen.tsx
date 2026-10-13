"use client";

import { useState } from "react";
import Link from "next/link";
import { Lifebuoy } from "@phosphor-icons/react";
import { useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/cn";
import type { Level, Role } from "@/lib/domain/types";
import { LEVELS } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { LevelBadge, StatusChip } from "@/components/ui/status";

const STAFF: Role[] = ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain"];
const FLOOR: Role[] = ["server", "runner", "busser", "bartender", "barback", "captain"];

/** Which screens each role uses (BLUEPRINT 6.1). Managers and owners see every section. */
export const GUIDE_SECTIONS: Array<{ key: string; roles: Role[] }> = [
  { key: "today", roles: [...STAFF, "manager"] },
  { key: "tasks", roles: [...STAFF, "manager"] },
  { key: "menu", roles: ["server", "runner", "bartender", "barback", "kitchen", "captain", "manager"] },
  { key: "floor", roles: FLOOR },
  { key: "requests", roles: [...STAFF, "manager"] },
  { key: "notes", roles: ["server", "captain", "manager"] },
  { key: "kitchen", roles: ["kitchen"] },
  { key: "inventory", roles: ["bartender", "barback", "manager"] },
  { key: "messages", roles: [...STAFF, "manager"] },
  { key: "rules", roles: [...STAFF, "manager"] },
  { key: "warnings", roles: [...STAFF, "manager"] },
  { key: "schedule", roles: [...STAFF, "manager"] },
  { key: "me", roles: [...STAFF, "manager", "owner"] },
  { key: "manage", roles: ["manager", "captain"] },
  { key: "close", roles: ["manager"] },
  { key: "team", roles: ["manager", "owner"] },
  { key: "owner", roles: ["owner"] },
  { key: "pay", roles: [...STAFF, "manager", "owner"] },
];

/** Short how-to per screen and the training checklist per level (BLUEPRINT 6.1 /guide, ADR 0014). */
export function GuideScreen() {
  const t = useT();
  const me = useMe();
  const role = (me?.role ?? "server") as Role;
  const sees = (roles: Role[]) => role === "owner" || role === "dev" || role === "manager" || roles.includes(role);
  const [all, setAll] = useState(false);
  const sections = GUIDE_SECTIONS.filter((s) => all || sees(s.roles));
  const myLevel = (me?.level ?? "C") as Level;
  const showLevels = STAFF.includes(role) || role === "manager" || role === "owner" || role === "dev";

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={t("guide.title")} subtitle={t("guide.subtitle")} />

      <nav aria-label={t("guide.contents")} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {sections.map((s) => (
          <a key={s.key} href={`#${s.key}`} className="pressable inline-flex min-h-target shrink-0 items-center rounded-pill border border-line px-4 text-small font-semibold whitespace-nowrap text-ink">
            {t(`guide.section.${s.key}.title`)}
          </a>
        ))}
      </nav>

      <Section
        title={all ? t("guide.everything") : t("guide.forYou")}
        action={
          role !== "owner" && role !== "manager" ? (
            <Button variant="quiet" size="md" onClick={() => setAll((a) => !a)}>
              {all ? t("guide.showMine") : t("guide.showAll")}
            </Button>
          ) : undefined
        }
      >
        <ul className="flex flex-col gap-3">
          {sections.map((s) => (
            <li key={s.key} id={s.key} className="scroll-mt-32">
              <Card className="flex flex-col gap-1.5">
                <h2 className="text-body font-semibold text-ink">{t(`guide.section.${s.key}.title`)}</h2>
                <p className="text-body text-ink-muted">{t(`guide.section.${s.key}.body`)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      {showLevels ? (
        <Section title={t("guide.levelsTitle")} id="levels">
          <p className="px-1 text-body text-ink-muted">{t("guide.levelsBody")}</p>
          <ul className="flex flex-col gap-3">
            {LEVELS.slice()
              .reverse()
              .map((level) => (
                <li key={level}>
                  <Card className={cn("flex flex-col gap-3", level === myLevel && STAFF.includes(role) && "border-brand bg-brand-soft")}>
                    <div className="flex items-center gap-3">
                      <LevelBadge level={level} label={t(`levels.${level}`)} />
                      <h3 className="flex-1 text-body font-semibold text-ink">{t(`guide.level.${level}.title`)}</h3>
                      {level === myLevel && STAFF.includes(role) ? (
                        <StatusChip tone="brand" size="sm" icon={false}>
                          {t("guide.yourLevel")}
                        </StatusChip>
                      ) : null}
                    </div>
                    <ol className="flex list-decimal flex-col gap-1.5 pl-6 text-body text-ink marker:font-mono marker:text-ink-muted">
                      {["i1", "i2", "i3", "i4", "i5"].map((i) => (
                        <li key={i}>{t(`guide.level.${level}.${i}`)}</li>
                      ))}
                    </ol>
                  </Card>
                </li>
              ))}
          </ul>
        </Section>
      ) : null}

      <p className="flex items-start gap-2 px-1 text-small text-ink-muted">
        <Lifebuoy weight="bold" className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("guide.stillStuck")}
      </p>
    </div>
  );
}

/** The help button other screens use: opens this guide at their section. */
export function HelpLink({ section, className }: { section: string; className?: string }) {
  const t = useT();
  return (
    <Link
      href={`/guide#${section}`}
      aria-label={t("guide.helpFor")}
      className={cn("pressable hover-surface inline-flex size-target shrink-0 items-center justify-center rounded-full text-ink-muted", className)}
    >
      <Lifebuoy weight="bold" className="size-6" aria-hidden />
    </Link>
  );
}
