"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare, Lifebuoy } from "@phosphor-icons/react";
import { useMe } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/cn";
import { can } from "@/lib/domain/permissions";
import type { Action } from "@/lib/domain/permissions";
import { isAtLeast, nextOnLadder } from "@/lib/domain/positions";
import type { Position } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Section } from "@/components/ui/layout";
import { PositionBadge } from "@/components/ui/status";
import { RolePlaybook } from "./role-playbook";

/** Which screens a position uses (BLUEPRINT 6.1): a section shows when the position can do its action. */
export const GUIDE_SECTIONS: Array<{ key: string; action: Action }> = [
  { key: "today", action: "today.view" },
  { key: "schedule", action: "schedule.own" },
  { key: "tasks", action: "tasks.own" },
  { key: "menu", action: "menu.view" },
  { key: "section", action: "floor.view" },
  { key: "requests", action: "requests.help" },
  { key: "notes", action: "notes.add" },
  { key: "bar", action: "bar.report" },
  { key: "pass", action: "notes.allergy" },
  { key: "preshift", action: "preshift.publish" },
  { key: "floor", action: "floor.map" },
  { key: "messages", action: "messages.read" },
  { key: "rules", action: "rules.read" },
  { key: "warnings", action: "warnings.own" },
  { key: "propose", action: "warnings.propose" },
  { key: "me", action: "today.view" },
  { key: "manage", action: "shift.control" },
  { key: "manageSchedule", action: "schedule.manage" },
  { key: "issue", action: "warnings.issue" },
  { key: "close", action: "close.file" },
  { key: "team", action: "team.view" },
  { key: "venue", action: "venue.state" },
  { key: "company", action: "company.view" },
];

/** Positions with a training checklist: every position below venue management (BLUEPRINT 2.5). */
const TRAINED: Position[] = [
  "polisher",
  "busser",
  "runner",
  "server",
  "captain",
  "host",
  "maitre_d",
  "expo",
  "barback",
  "bartender",
  "head_bartender",
  "sommelier",
  "dishwasher",
  "prep_cook",
  "line_cook",
  "sous_chef",
];
const ITEMS = ["i1", "i2", "i3", "i4"];

/** How-to per screen for my position and the training checklist per position (BLUEPRINT 6.1 /guide, 2.5). */
export function GuideScreen() {
  const t = useT();
  const me = useMe();
  const position = (me?.position ?? "server") as Position;
  const leader = isAtLeast(position, "manager");
  const [all, setAll] = useState(false);
  const sections = GUIDE_SECTIONS.filter((s) => all || leader || can(position, s.action));
  const mine = TRAINED.includes(position) ? position : null;
  const next = mine ? nextOnLadder(mine) : null;
  const training = leader ? TRAINED : [mine, next && TRAINED.includes(next) ? next : null].filter((p): p is Position => !!p);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={t("guide.title")} subtitle={t("guide.subtitle")} />
      <RolePlaybook />

      <nav aria-label={t("guide.contents")} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {sections.map((s) => (
          <a key={s.key} href={`#${s.key}`} className="pressable inline-flex min-h-target shrink-0 items-center rounded-pill border border-line px-4 text-small font-semibold whitespace-nowrap text-ink">
            {t(`guide.section.${s.key}.title`)}
          </a>
        ))}
      </nav>

      <Section
        title={all || leader ? t("guide.everything") : t("guide.forYou")}
        action={
          !leader ? (
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

      {training.length ? (
        <Section title={t("guide.trainingTitle")} id="training">
          <p className="px-1 text-body text-ink-muted">{t("guide.trainingBody")}</p>
          <ul className="flex flex-col gap-3">
            {training.map((p) => (
              <li key={p}>
                <Card className={cn("flex flex-col gap-3", p === mine && "border-brand")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <PositionBadge position={p} />
                    {p === mine ? <span className="text-small font-semibold text-brand">{t("guide.yourPosition")}</span> : p === next ? <span className="text-small font-semibold text-ink-muted">{t("guide.nextPosition")}</span> : null}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {ITEMS.map((i) => (
                      <li key={i} className="flex items-start gap-2 text-body text-ink">
                        <CheckSquare weight="bold" className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
                        <span>{t(`guide.training.${p}.${i}`)}</span>
                      </li>
                    ))}
                  </ul>
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
