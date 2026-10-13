"use client";

import { useMemo, useState } from "react";
import { ArrowUp, MagnifyingGlass, Medal, SealWarning, UsersThree } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useCan, useVenue } from "@/hooks/use-app";
import { dateKeyLabel } from "@/lib/format";
import { pickLocalized } from "@/lib/domain/i18n";
import { LADDERS, ladderOf, nextOnLadder } from "@/lib/domain/positions";
import { AREAS } from "@/lib/domain/types";
import type { ConfirmState, Localized, Position, WarningState } from "@/lib/domain/types";
import { nyDateKey, addDays } from "@/lib/time";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, LinkRow, List, PageHeader, Row, Section } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { PositionBadge, StateChip, StatusChip } from "@/components/ui/status";
import { WarningCard } from "@/components/warnings/warning-card";
import { cn } from "@/lib/cn";

// The team in states (ADR 0027): people by area with their warning state and confirmation state, the reasons in
// words, recognition, and the rules most missed. No scores, no percentages, never visible to peers.

/** Promotions waiting for the director or owner (company-wide). */
function PendingPromotions() {
  const { t, locale } = useLocale();
  const list = useQuery(api.staff.pendingPromotions, {});
  const decide = useRun(api.staff.decidePromotion, { success: t("team.promotionDecided") });
  if (!list?.length) return null;
  return (
    <Section title={t("team.pendingPromotions")}>
      <ul className="flex flex-col gap-3">
        {list.map((p) => (
          <li key={p._id}>
            <Card className="flex flex-col gap-3">
              <p className="text-body font-semibold text-ink">{p.name}</p>
              <p className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
                {p.fromPosition ? <PositionBadge position={p.fromPosition as Position} /> : null}
                <ArrowUp weight="bold" className="size-4 rotate-90" aria-hidden />
                <PositionBadge position={p.toPosition as Position} />
                <span>{t("team.effectiveFrom", { date: dateKeyLabel(locale, p.effectiveFrom) })}</span>
              </p>
              <p className="text-small text-ink-muted">{t("team.proposedBy", { name: p.proposedBy })}</p>
              {p.note ? <p className="text-body text-ink">{p.note}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button size="md" loading={decide.busy} onClick={() => void decide.run({ historyId: p._id, approve: true })}>
                  {t("team.approve")}
                </Button>
                <Button size="md" variant="secondary" loading={decide.busy} onClick={() => void decide.run({ historyId: p._id, approve: false })}>
                  {t("team.deny")}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function TeamBoard() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const canApprove = useCan("staff.promote_approve");
  const data = useQuery(api.reports.team, venueId ? { venueId } : "skip");
  const [q, setQ] = useState("");
  const people = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => !s || p.name.toLowerCase().includes(s) || t(`positions.${p.position}`).toLowerCase().includes(s));
  }, [data, q, t]);
  const recognized = (data?.people ?? []).filter((p) => p.recognition >= 5).sort((a, b) => b.recognition - a.recognition).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={venueName} title={t("team.title")} subtitle={t("team.subtitle")} />
      {canApprove ? <PendingPromotions /> : null}
      {data === undefined ? (
        <ScreenSkeleton rows={6} />
      ) : !data.people.length ? (
        <EmptyState icon={<UsersThree weight="bold" />} title={t("team.noneTitle")} body={t("team.noneBody")} />
      ) : (
        <>
          {recognized.length ? (
            <Card className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-small font-semibold text-ink-muted">
                <Medal weight="bold" className="size-5 text-brand" aria-hidden />
                {t("team.recognition")}
              </p>
              <ul className="flex flex-col gap-1">
                {recognized.map((p) => (
                  <li key={p.userId} className="text-body text-ink">
                    {t("team.recognitionLine", { name: p.name })}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <label className="relative block">
            <span className="sr-only">{t("team.search")}</span>
            <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("team.search")} className="pl-12" type="search" />
          </label>
          {AREAS.filter((a) => people.some((p) => p.area === a)).map((area) => (
            <Section key={area} title={t(`areas.${area}`)}>
              <List>
                {people
                  .filter((p) => p.area === area)
                  .map((p) => (
                    <LinkRow
                      key={p.userId}
                      href={`/manage/team/${p.userId}`}
                      title={p.name}
                      subtitle={
                        p.topRules.length
                          ? t("team.mostMissedShort", { rules: p.topRules.map((r: Localized) => pickLocalized(r, locale)).join(", ") })
                          : p.reasons.length
                            ? reasonsLine(t, p.reasons)
                            : t(`positions.${p.position}`)
                      }
                      trailing={
                        <span className="flex flex-col items-end gap-1">
                          {p.warnings !== "up_to_date" ? <StateChip state={p.warnings as WarningState} size="sm" /> : null}
                          {p.confirmation !== "confirmed" ? <StateChip state={p.confirmation as ConfirmState} size="sm" /> : null}
                          {p.warnings === "up_to_date" && p.confirmation === "confirmed" ? <StateChip state="up_to_date" size="sm" /> : null}
                        </span>
                      }
                    />
                  ))}
              </List>
            </Section>
          ))}
        </>
      )}
    </div>
  );
}

function reasonsLine(t: ReturnType<typeof useLocale>["t"], reasons: string[]) {
  return reasons.map((r) => t(`team.reason.${r.replace(".", "_")}`)).join(", ");
}

/** A career ladder with the person's steps marked (BLUEPRINT 2.5). */
export function LadderView({ position, reached }: { position: Position; reached: Position[] }) {
  const { t } = useLocale();
  const key = ladderOf(position);
  if (!key) return null;
  const steps = LADDERS[key];
  return (
    <ol aria-label={t(`team.ladder_${key}`)} className="flex flex-col gap-0">
      {steps.map((s, i) => {
        const here = s === position;
        const past = reached.includes(s) && !here;
        return (
          <li key={s} className="flex items-stretch gap-3">
            <span className="flex flex-col items-center">
              <span aria-hidden className={cn("mt-3 size-3.5 shrink-0 rounded-full border-2", here ? "border-brand bg-brand" : past ? "border-brand bg-canvas" : "border-line-strong bg-canvas")} />
              {i < steps.length - 1 ? <span aria-hidden className={cn("w-0.5 flex-1", past || here ? "bg-brand" : "bg-line")} /> : null}
            </span>
            <span className={cn("flex min-h-target items-center text-body", here ? "font-semibold text-ink" : past ? "text-ink" : "text-ink-muted")}>
              {t(`positions.${s}`)}
              {here ? <span className="ml-2 text-small font-normal text-brand">{t("team.now")}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PromoteSheet({ userId, name, position, onClose }: { userId: Id<"users">; name: string; position: Position; onClose: () => void }) {
  const { t } = useLocale();
  const next = nextOnLadder(position);
  const [to, setTo] = useState<Position | "">(next ?? "");
  const [from, setFrom] = useState(() => addDays(nyDateKey(Date.now()), 7));
  const [note, setNote] = useState("");
  const promote = useRun(api.staff.promote, { success: t("team.promotionSent") });
  const key = ladderOf(position);
  const options = key ? LADDERS[key].slice(LADDERS[key].indexOf(position) + 1) : [];
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("team.promoteTitle")}
      description={t("team.promoteBody", { name })}
      footer={
        <Button
          block
          disabled={!to}
          loading={promote.busy}
          onClick={async () => {
            if (to && (await promote.run({ userId, toPosition: to, effectiveFrom: from, note: note.trim() || undefined }))) onClose();
          }}
        >
          {t("team.promoteSend")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("team.toPosition")}>
          {(p) => (
            <Select {...p} value={to} onChange={(e) => setTo(e.target.value as Position)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {t(`positions.${o}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("team.effectiveFromLabel")}>{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={t("team.promoteNote")} optional={t("common.optional")} help={t("team.promoteNoteHelp")}>
          {(p) => <Textarea {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}

export function PersonDetail({ userId }: { userId: Id<"users"> }) {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const canPromote = useCan("staff.promote_propose");
  const canIssue = useCan("warnings.issue");
  const record = useQuery(api.warnings.forUser, venueId ? { userId, venueId } : "skip");
  const person = useQuery(api.staff.get, { userId });
  const team = useQuery(api.reports.team, venueId ? { venueId } : "skip");
  const [promoting, setPromoting] = useState(false);
  const [showOld, setShowOld] = useState(false);
  if (record === undefined || person === undefined) return <ScreenSkeleton rows={6} />;
  const row = team?.people.find((p) => p.userId === userId);
  const primary = person.primaryPosition as Position;
  const reached = person.history.filter((h) => h.status === "approved").map((h) => h.toPosition as Position);
  const pending = person.history.find((h) => h.status === "pending");
  const items = showOld ? record.items : record.items.filter((w) => w.counts || (!w.voidedAt && !w.acknowledgedAt));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/manage/team" eyebrow={t(`positions.${primary}`)} title={person.name} subtitle={person.title ?? undefined} />
      <div className="-mt-3 flex flex-wrap gap-2">
        <StateChip state={record.state as WarningState} />
        {row && row.confirmation !== "confirmed" ? <StateChip state={row.confirmation as ConfirmState} /> : null}
        {row && row.recognition >= 5 ? (
          <StatusChip tone="brand" icon={<Medal weight="bold" />}>
            {t("team.recognized")}
          </StatusChip>
        ) : null}
      </div>
      {row?.reasons.length ? <p className="text-body text-ink-muted">{reasonsLine(t, row.reasons)}</p> : null}

      <Section title={t("team.positions")}>
        <div className="flex flex-wrap gap-2">
          <PositionBadge position={primary} className="border-brand text-brand" />
          {person.enabledPositions.map((p) => (
            <PositionBadge key={p} position={p as Position} />
          ))}
        </div>
        <p className="px-1 text-small text-ink-muted">{t("team.enabledHelp")}</p>
      </Section>

      <Section title={t("team.ladder")}>
        <Card>
          <LadderView position={primary} reached={reached} />
        </Card>
        {pending ? (
          <StatusChip tone="attention" className="self-start">
            {t("team.pendingTo", { position: t(`positions.${pending.toPosition}`) })}
          </StatusChip>
        ) : canPromote && nextOnLadder(primary) ? (
          <Button variant="secondary" size="md" className="self-start" icon={<ArrowUp weight="bold" />} onClick={() => setPromoting(true)}>
            {t("team.promote")}
          </Button>
        ) : null}
      </Section>

      <Section title={t("team.history")}>
        <List>
          {person.history.map((h) => (
            <Row
              key={h._id}
              title={h.fromPosition ? t("team.historyStep", { from: t(`positions.${h.fromPosition}`), to: t(`positions.${h.toPosition}`) }) : t(`positions.${h.toPosition}`)}
              subtitle={`${dateKeyLabel(locale, h.effectiveFrom)}${h.approvedBy ? `, ${t("team.approvedBy", { name: h.approvedBy })}` : ""}`}
              trailing={h.status === "pending" ? <StateChip state="pending" size="sm" /> : h.status === "denied" ? <StatusChip tone="neutral" size="sm">{t("team.denied")}</StatusChip> : null}
            />
          ))}
        </List>
      </Section>

      <Section
        title={t("team.warningsTimeline")}
        action={
          canIssue ? (
            <ButtonLink href={`/manage/warnings/new?userId=${userId}`} variant="secondary" size="md" icon={<SealWarning weight="bold" />}>
              {t("team.logWarning")}
            </ButtonLink>
          ) : null
        }
      >
        {items.length ? (
          <ul className="flex flex-col gap-3">
            {items.map((w) => (
              <li key={w._id}>
                <WarningCard w={w} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("team.noWarnings")}</p>
        )}
        {record.items.length > items.length || showOld ? (
          <Button variant="quiet" size="md" className="self-start" onClick={() => setShowOld((s) => !s)}>
            {showOld ? t("team.hideOld") : t("team.showOld")}
          </Button>
        ) : null}
      </Section>
      {promoting ? <PromoteSheet userId={userId} name={person.name} position={primary} onClose={() => setPromoting(false)} /> : null}
    </div>
  );
}
