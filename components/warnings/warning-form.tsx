"use client";

import { useMemo, useState } from "react";
import { CheckCircle, MagnifyingGlass, PaperPlaneTilt, Warning, WarningOctagon, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useVenue } from "@/hooks/use-app";
import { pickLocalized } from "@/lib/domain/i18n";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceTiles } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PhotoField } from "@/components/ui/photo-field";
import { InlineError, ScreenSkeleton, EmptyState } from "@/components/ui/states";
import { PositionBadge, StateChip } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import type { Position, WarningState } from "@/lib/domain/types";

/**
 * The 30-second warning form (BLUEPRINT 2.6, ADR 0026): person, rule, severity, optional note and photo. Area leads
 * propose (the manager on duty issues or discards); managers and above issue. The list of people comes from the
 * chain of supervision: a lead only sees their own team. `initialUserId` and `initialRuleKey` pre-fill the form (the
 * schedule's "Log a warning" after a late mark).
 */
export function WarningForm({ mode, initialUserId, initialRuleKey, back }: { mode: "issue" | "propose"; initialUserId?: string; initialRuleKey?: string; back: string }) {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const allPeople = useQuery(api.warnings.people, venueId ? { venueId } : "skip");
  const people = useMemo(() => (allPeople ?? []).filter((p) => (mode === "issue" ? p.mode === "issue" : true)), [allPeople, mode]);
  const [personId, setPersonId] = useState<string | null>(initialUserId ?? null);
  const [personQuery, setPersonQuery] = useState("");
  const rules = useQuery(api.warnings.rulesFor, venueId && personId ? { venueId, userId: personId as Id<"users"> } : "skip");
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [ruleQuery, setRuleQuery] = useState("");
  const [severity, setSeverity] = useState<"minor" | "major" | null>(null);
  const [note, setNote] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; state: WarningState | null } | null>(null);
  const issue = useRun(api.warnings.issue, { silent: true });
  const propose = useRun(api.warnings.propose, { silent: true });
  const run = mode === "issue" ? issue : propose;

  // The rule given by key applies until the person or the rule is changed by hand.
  const [useInitial, setUseInitial] = useState(!!initialRuleKey);
  const chosenRule = ruleId ?? (useInitial && initialRuleKey ? (rules?.find((r) => r.key === initialRuleKey)?._id ?? null) : null);

  const person = people.find((p) => p._id === personId) ?? null;
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q) || t(`positions.${p.primaryPosition}`).toLowerCase().includes(q));
  }, [people, personQuery, t]);
  const filteredRules = useMemo(() => {
    const q = ruleQuery.trim().toLowerCase();
    return (rules ?? []).filter((r) => !q || pickLocalized(r.title, locale).toLowerCase().includes(q) || pickLocalized(r.body, locale).toLowerCase().includes(q));
  }, [rules, ruleQuery, locale]);

  const reset = () => {
    setPersonId(null);
    setRuleId(null);
    setSeverity(null);
    setNote("");
    setPhotoId(null);
    setPersonQuery("");
    setRuleQuery("");
    setDone(null);
    run.reset();
    setOpenedAt(Date.now());
  };

  const submit = async () => {
    if (!venueId || !personId || !severity || !chosenRule) return;
    const args = {
      venueId,
      userId: personId as Id<"users">,
      ruleId: chosenRule,
      severity,
      note: note.trim() || undefined,
      photoId: (photoId as Id<"_storage">) ?? undefined,
      formMs: Date.now() - openedAt,
    };
    if (mode === "issue") {
      const r = await issue.run(args);
      if (r) setDone({ name: person?.name ?? "", state: r.state as WarningState });
    } else {
      const r = await propose.run(args);
      if (r) setDone({ name: person?.name ?? "", state: null });
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 pt-10 text-center">
        <span className="check-pop flex size-16 items-center justify-center rounded-full bg-ok-bg text-ok-fg">
          <CheckCircle weight="fill" className="size-9" aria-hidden />
        </span>
        <div className="flex flex-col gap-2" role="status">
          <h1 className="text-title font-bold text-ink">{t(mode === "issue" ? "warnings.sentTitle" : "warnings.proposedTitle")}</h1>
          <p className="text-body text-ink-muted">{t(mode === "issue" ? "warnings.sentBody" : "warnings.proposedBody", { name: done.name })}</p>
        </div>
        {done.state ? <StateChip state={done.state} /> : null}
        <div className="flex w-full max-w-sm flex-col gap-3 pt-4">
          <Button block onClick={reset}>
            {t(mode === "issue" ? "warnings.logAnother" : "warnings.proposeAnother")}
          </Button>
          <ButtonLink href={back} variant="secondary" block>
            {t("warnings.backToList")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t(mode === "issue" ? "warnings.newTitle" : "warnings.proposeTitle")} subtitle={t(mode === "issue" ? "warnings.newSubtitle" : "warnings.proposeSubtitle")} back={back} />
      <div className="flex flex-col gap-7">
        <Section title={t("warnings.stepPerson")}>
          {person ? (
            <div className="flex min-h-target-lg items-center gap-3 rounded-card border border-ink bg-brand-soft px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-body font-semibold text-ink">{person.name}</span>
                <PositionBadge position={person.primaryPosition as Position} className="self-start" />
              </span>
              <StateChip state={person.state as WarningState} size="sm" />
              <button
                type="button"
                onClick={() => {
                  setPersonId(null);
                  setRuleId(null);
                  setUseInitial(false);
                }}
                aria-label={t("warnings.changePerson")}
                className="pressable flex size-target items-center justify-center rounded-full text-ink-muted"
              >
                <X weight="bold" className="size-5" />
              </button>
            </div>
          ) : allPeople === undefined ? (
            <ScreenSkeleton rows={3} />
          ) : (
            <div className="flex flex-col gap-3">
              <label className="relative block">
                <span className="sr-only">{t("warnings.searchPerson")}</span>
                <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
                <Input value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} placeholder={t("warnings.searchPerson")} className="pl-12" type="search" enterKeyHint="search" />
              </label>
              <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line">
                {filteredPeople.map((p) => (
                  <li key={p._id}>
                    <button type="button" onClick={() => setPersonId(p._id)} className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2 text-left">
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-body font-semibold text-ink">{p.name}</span>
                        <PositionBadge position={p.primaryPosition as Position} className="self-start" />
                      </span>
                      {p.state !== "up_to_date" ? <StateChip state={p.state as WarningState} size="sm" /> : null}
                    </button>
                  </li>
                ))}
                {filteredPeople.length === 0 ? <li className="px-4 py-4 text-body text-ink-muted">{t(mode === "propose" ? "warnings.noTeam" : "warnings.noPeople")}</li> : null}
              </ul>
            </div>
          )}
        </Section>

        {person ? (
          <Section title={t("warnings.stepRule")}>
            {rules === undefined ? (
              <ScreenSkeleton rows={3} />
            ) : rules.length === 0 ? (
              <EmptyState title={t("warnings.noRulesTitle")} body={t("warnings.noRulesBody")} />
            ) : (
              <div className="flex flex-col gap-3">
                <label className="relative block">
                  <span className="sr-only">{t("warnings.searchRule")}</span>
                  <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
                  <Input value={ruleQuery} onChange={(e) => setRuleQuery(e.target.value)} placeholder={t("warnings.searchRule")} className="pl-12" type="search" enterKeyHint="search" />
                </label>
                <ul role="radiogroup" aria-label={t("warnings.stepRule")} className="flex flex-col gap-2">
                  {filteredRules.map((r) => {
                    const on = r._id === chosenRule;
                    return (
                      <li key={r._id}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setRuleId(r._id)}
                          className={cn("pressable flex min-h-target-lg w-full flex-col items-start gap-0.5 rounded-card border-2 px-4 py-3 text-left", on ? "border-ink bg-brand-soft" : "hover-line border-line")}
                        >
                          <span className="text-body font-semibold text-ink">{pickLocalized(r.title, locale)}</span>
                          <span className="line-clamp-2 text-small text-ink-muted">{pickLocalized(r.body, locale)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Section>
        ) : null}

        {person ? (
          <Section title={t("warnings.stepSeverity")}>
            <ChoiceTiles<"minor" | "major">
              label={t("warnings.stepSeverity")}
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "minor", label: t("warnings.severity.minor"), hint: t("warnings.minorHint"), icon: <Warning weight="bold" /> },
                { value: "major", label: t("warnings.severity.major"), hint: t("warnings.majorHint"), icon: <WarningOctagon weight="bold" />, tone: "danger" },
              ]}
            />
          </Section>
        ) : null}

        {person ? (
          <Section title={t("warnings.stepNote")}>
            <Field label={t("warnings.noteLabel")} optional={t("common.optional")} help={t("warnings.noteHelp")}>
              {(p) => <Textarea {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            <PhotoField value={photoId} onChange={setPhotoId} purpose="warning" compact />
          </Section>
        ) : null}

        <InlineError>{run.message}</InlineError>
        {person ? (
          <Button block loading={run.busy} disabled={!chosenRule || !severity} onClick={() => void submit()} icon={<PaperPlaneTilt weight="bold" className="size-5" />}>
            {t(mode === "issue" ? "warnings.send" : "warnings.proposeSend")}
          </Button>
        ) : null}
        {person ? <p className="text-small text-ink-muted">{t(mode === "issue" ? "warnings.privacyNote" : "warnings.proposeNote")}</p> : null}
      </div>
    </>
  );
}
