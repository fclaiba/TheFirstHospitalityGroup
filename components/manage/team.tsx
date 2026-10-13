"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass, SealWarning, Trophy } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useVenue } from "@/hooks/use-app";
import { useLocale } from "@/lib/i18n-client";
import { dateKeyLabel, dateShort } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import type { WarningState } from "@/lib/domain/types";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, Kpi, KpiGrid, LinkRow, List, PageHeader, Row, Section } from "@/components/ui/layout";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { LevelBadge, STATE_TONE, StatusChip } from "@/components/ui/status";
import { Segmented } from "@/components/ui/choice";
import { cn } from "@/lib/cn";

const pct = (n: number | null) => (n === null ? "·" : `${n}%`);

/** Performance board (BLUEPRINT 2.2): per person, per role, and recognition. States always as icon + word. */
export function TeamBoard() {
  const { t } = useLocale();
  const { venueId, venueName } = useVenue();
  const data = useQuery(api.reports.team, venueId ? { venueId } : "skip");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | WarningState>("all");
  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => (filter === "all" || p.state === filter) && (!needle || p.name.toLowerCase().includes(needle) || t(`roles.${p.role}`).toLowerCase().includes(needle)));
  }, [data, q, filter, t]);
  if (!venueId) return <EmptyState title={t("errors.VENUE_FORBIDDEN")} />;
  if (data === undefined) return <ScreenSkeleton rows={6} />;
  const count = (s: WarningState) => data.people.filter((p) => p.state === s).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={venueName} title={t("team.title")} subtitle={t("team.subtitle", { days: data.thresholds.windowDays })} />
      <Card lift>
        <KpiGrid>
          <Kpi label={t("states.up_to_date")} value={count("up_to_date")} tone="ok" />
          <Kpi label={t("states.attention")} value={count("attention")} />
          <Kpi label={t("states.follow_up")} value={count("follow_up")} />
          <Kpi label={t("states.review")} value={count("review")} tone={count("review") ? "danger" : undefined} />
        </KpiGrid>
      </Card>

      {data.recognition.length ? (
        <Section title={t("team.recognition")}>
          <List>
            {data.recognition.map((r) => (
              <LinkRow
                key={r.id}
                href={`/manage/team/${r.id}`}
                leading={<Trophy weight="fill" className="size-5 text-brand" />}
                title={r.name}
                subtitle={t(`roles.${r.role}`)}
                trailing={<span className="font-mono text-small text-ink tabular">{t("team.shiftsInARow", { n: r.streak })}</span>}
              />
            ))}
          </List>
        </Section>
      ) : null}

      <Section title={t("team.people")}>
        <label className="relative block">
          <span className="sr-only">{t("common.search")}</span>
          <MagnifyingGlass weight="bold" aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" />
          <Input type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("team.search")} className="pl-12" />
        </label>
        <Segmented
          label={t("team.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("common.all") },
            { value: "attention", label: t("states.attention"), badge: count("attention") },
            { value: "follow_up", label: t("states.follow_up"), badge: count("follow_up") },
            { value: "review", label: t("states.review"), badge: count("review") },
          ]}
        />
        {people.length ? (
          <List>
            {people.map((p) => (
              <LinkRow
                key={p.id}
                href={`/manage/team/${p.id}`}
                leading={<LevelBadge level={p.level} label={t(`levels.${p.level}`)} />}
                title={p.name}
                subtitle={t("team.rowStats", { role: t(`roles.${p.role}`), onTime: pct(p.onTime), read: pct(p.readRate) })}
                trailing={
                  <StatusChip tone={STATE_TONE[p.state]} size="sm">
                    {t(`states.${p.state}`)}
                  </StatusChip>
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState title={t("team.noneTitle")} body={t("team.noneBody")} />
        )}
      </Section>

      <Section title={t("team.byRole")}>
        <List>
          {data.roles.map((r) => (
            <Row
              key={r.role}
              title={t(`roles.${r.role}`)}
              subtitle={t("team.roleStats", { people: r.people, onTime: pct(r.onTime) })}
              trailing={
                r.states.review || r.states.follow_up ? (
                  <StatusChip tone={r.states.review ? "review" : "follow"} size="sm">
                    {r.states.review ? `${t("states.review")} ${r.states.review}` : `${t("states.follow_up")} ${r.states.follow_up}`}
                  </StatusChip>
                ) : (
                  <StatusChip tone="ok" size="sm">
                    {t("states.up_to_date")}
                  </StatusChip>
                )
              }
            />
          ))}
        </List>
      </Section>
    </div>
  );
}

export function PersonDetail({ userId }: { userId: Id<"users"> }) {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const data = useQuery(api.reports.person, venueId ? { userId, venueId } : "skip");
  if (data === undefined) return <ScreenSkeleton rows={5} />;
  const p = data.person;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back="/manage/team"
        eyebrow={`${t(`roles.${p.role}`)} · ${t(`levels.${p.level}`)}`}
        title={p.name}
        action={
          <StatusChip tone={STATE_TONE[p.state]}>
            {t(`states.${p.state}`)}
          </StatusChip>
        }
      />
      <Card lift>
        <KpiGrid>
          <Kpi label={t("team.warningsWindow")} value={p.warnings} hint={p.major ? t("team.majorN", { n: p.major }) : undefined} tone={p.major ? "danger" : undefined} />
          <Kpi label={t("team.onTime")} value={pct(p.onTime)} hint={t("team.runsN", { n: p.runs })} />
          <Kpi label={t("team.readRate")} value={pct(p.readRate)} />
          <Kpi label={t("team.streak")} value={p.streak} hint={t("team.best", { n: p.bestStreak })} tone={p.streak ? "ok" : undefined} />
        </KpiGrid>
      </Card>
      <ButtonLink href={`/manage/warnings/new?userId=${userId}`} variant="secondary" icon={<SealWarning weight="bold" className="size-5" />}>
        {t("manage.logWarning")}
      </ButtonLink>

      {p.topRules.length ? (
        <Section title={t("team.mostMissed")}>
          <List>
            {p.topRules.map((r) => (
              <Row key={r.ruleId} title={pickLocalized(r.title, locale)} trailing={<span className="font-mono text-small tabular">{r.count}×</span>} />
            ))}
          </List>
        </Section>
      ) : null}

      <Section title={t("team.warningsTimeline")}>
        {data.warnings.length ? (
          <ul className="flex flex-col gap-2">
            {data.warnings.map((w) => (
              <li key={w._id} className={cn("rounded-card border border-line bg-surface-raised p-4", !w.counts && "opacity-70")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={cn("text-body font-semibold text-ink", !!w.voidedAt && "line-through")}>{pickLocalized(w.rule, locale)}</p>
                  <StatusChip tone={w.voidedAt ? "neutral" : w.severity === "major" ? "review" : "attention"} size="sm">
                    {w.voidedAt ? t("team.voided") : t(`team.${w.severity}`)}
                  </StatusChip>
                </div>
                <p className="mt-1 text-small text-ink-muted">
                  {dateShort(locale, w.at)} · {t("common.by", { name: w.loggedBy })}
                </p>
                {w.note ? <p className="mt-2 text-body text-ink">{w.note}</p> : null}
                {w.response ? <p className="mt-2 border-l-2 border-line-strong pl-3 text-body text-ink-muted">“{w.response}”</p> : null}
                <p className="mt-2 text-caption font-semibold text-ink-muted">{w.acknowledgedAt ? t("team.acknowledged") : t("team.notAcknowledged")}</p>
                {w.voidReason ? <p className="mt-1 text-caption text-ink-muted">{w.voidReason}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("team.noWarnings")} />
        )}
      </Section>

      <Section title={t("team.recentRuns")}>
        {data.runs.length ? (
          <List>
            {data.runs.map((r) => (
              <Row
                key={r._id}
                title={`${dateKeyLabel(locale, r.date)}, ${t(`phases.${r.phase}`)}`}
                subtitle={`${r.done}/${r.total}`}
                trailing={
                  r.excused ? (
                    <StatusChip tone="neutral" size="sm">
                      {t("manage.excused")}
                    </StatusChip>
                  ) : r.late ? (
                    <StatusChip tone="follow" size="sm">
                      {t("manage.lateBadge")}
                    </StatusChip>
                  ) : r.completedAt ? (
                    <StatusChip tone="ok" size="sm">
                      {t("team.onTimeShort")}
                    </StatusChip>
                  ) : null
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState title={t("team.noRuns")} />
        )}
      </Section>
    </div>
  );
}
