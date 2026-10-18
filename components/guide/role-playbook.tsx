"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { canDo, useMe, useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { areaOf } from "@/lib/domain/positions";
import { reportsTo } from "@/lib/domain/chain";
import { POSITIONS } from "@/lib/domain/types";
import type { Position } from "@/lib/domain/types";
import type { Action } from "@/lib/domain/permissions";
import { Field, Select } from "@/components/ui/field";
import { LinkRow, List, Row, Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";

type Destination = { href: string; action: Action; label: string };
function destinations(p: Position): [Destination, Destination, Destination] {
  const d = (href: string, action: Action, label: string): Destination => ({
    href,
    action,
    label,
  });
  if (p === "owner")
    return [
      d("/company", "company.view", "nav.company"),
      d("/company/setup", "company.setup", "mine.tool.companySetup"),
      d("/company/setup/audit", "audit.read", "company.setup.audit"),
    ];
  if (p === "director")
    return [
      d("/company", "company.view", "nav.company"),
      d("/company/setup/rules", "rules.company", "nav.rules"),
      d("/company", "company.view", "nav.company"),
    ];
  if (p === "gm")
    return [
      d("/manage/venue", "venue.state", "nav.venue"),
      d("/manage/team", "team.view", "nav.team"),
      d("/manage/close", "close.read", "nav.close"),
    ];
  if (p === "agm")
    return [
      d("/manage/schedule", "schedule.manage", "nav.manageSchedule"),
      d("/manage", "shift.control", "nav.shift"),
      d("/manage/close", "close.read", "nav.close"),
    ];
  if (p === "floor_manager")
    return [
      d("/manage", "shift.control", "nav.shift"),
      d("/lead/floor", "floor.map", "nav.floor"),
      d("/manage/close", "close.file", "nav.close"),
    ];
  if (p === "chef_de_cuisine")
    return [
      d("/lead/kitchen", "notes.allergy", "nav.kitchen"),
      d("/manage/menu", "menu.edit", "nav.manageMenu"),
      d("/manage/messages/new", "messages.send", "nav.announce"),
    ];
  if (p === "sous_chef")
    return [
      d("/lead/kitchen", "notes.allergy", "nav.kitchen"),
      d("/lead/preshift", "preshift.publish", "nav.preshift"),
      d("/tasks", "tasks.own", "mine.tool.tasks"),
    ];
  if (p === "expo")
    return [
      d("/menu", "menu.view", "nav.menu"),
      d("/lead/pass", "notes.allergy", "nav.pass"),
      d("/tasks", "tasks.own", "mine.tool.tasks"),
    ];
  if (p === "captain" || p === "maitre_d" || p === "host")
    return [
      d("/lead/floor", "floor.map", "nav.floor"),
      d("/lead/floor", "floor.map", "nav.floor"),
      d("/tasks", "tasks.own", "mine.tool.tasks"),
    ];
  if (areaOf(p) === "bar" && p !== "sommelier")
    return [
      d("/schedule", "schedule.own", "nav.schedule"),
      d(
        p === "head_bartender" ? "/lead/bar" : "/bar",
        p === "head_bartender" ? "bar.resolve" : "bar.report",
        "nav.bar",
      ),
      d("/tasks", "tasks.own", "mine.tool.tasks"),
    ];
  return [
    d("/today", "today.view", "nav.today"),
    d(
      areaOf(p) === "kitchen" ? "/tasks" : "/section",
      areaOf(p) === "kitchen" ? "tasks.own" : "floor.view",
      areaOf(p) === "kitchen" ? "mine.tool.tasks" : "nav.section",
    ),
    d("/tasks", "tasks.own", "mine.tool.tasks"),
  ];
}

export function RolePlaybook() {
  const t = useT(),
    me = useMe();
  const { venueId } = useVenue();
  const chart = useQuery(api.org.chart, venueId ? { venueId } : "skip");
  const [chosen, setChosen] = useState<Position | null>(null);
  if (!me) return null;
  const role =
    chosen ??
    ((me.primaryPosition === "dev" ? "owner" : me.primaryPosition) as Position);
  const supervisor =
    chart?.areas.flatMap((a) => a.positions).find((p) => p.position === role)
      ?.reportsTo ?? reportsTo(role);
  return (
    <Section title={t("operations.title")} id="role-playbook">
      <Field label={t("operations.role")}>
        {(props) => (
          <Select
            {...props}
            value={role}
            onChange={(e) => setChosen(e.target.value as Position)}
          >
            {POSITIONS.filter((p) => p !== "dev").map((p) => (
              <option key={p} value={p}>
                {t(`positions.${p}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p className="text-body text-ink">
        <strong>{t("operations.outcome")}: </strong>
        {t(`operations.roles.${role}.outcome`)}
      </p>
      <p className="text-small text-ink-muted">
        {supervisor
          ? `${t("operations.reportsTo")}: ${t(`positions.${supervisor}`)}`
          : t("operations.governance")}
      </p>
      <List>
        {(["before", "during", "after"] as const).map((phase, i) => {
          const target = destinations(role)[i]!;
          const props = {
            title: `${t(`operations.${phase}`)} · ${t(target.label)}`,
            subtitle: t(`operations.roles.${role}.${phase}`),
          };
          return canDo(me, target.action) ? (
            <LinkRow key={phase} href={target.href} {...props} />
          ) : (
            <Row key={phase} {...props} />
          );
        })}
      </List>
      <p className="text-small text-ink-muted">{t("operations.scope")}</p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/training" variant="secondary" size="md">
          {t("training.open")}
        </ButtonLink>
        {canDo(me, "training.review") ? (
          <ButtonLink href="/lead/training" variant="quiet" size="md">
            {t("training.queue")}
          </ButtonLink>
        ) : null}
        {canDo(me, "training.manage") ? (
          <ButtonLink href="/company/setup/training" variant="quiet" size="md">
            {t("training.manage")}
          </ButtonLink>
        ) : null}
      </div>
    </Section>
  );
}
