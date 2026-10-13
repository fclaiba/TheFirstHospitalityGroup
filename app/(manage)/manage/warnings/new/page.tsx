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
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, Section } from "@/components/ui/layout";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceTiles } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PhotoField } from "@/components/ui/photo-field";
import { InlineError, ScreenSkeleton, EmptyState } from "@/components/ui/states";
import { LevelBadge, StatusChip } from "@/components/ui/status";
import { STATE_TONES } from "@/components/warnings/warning-card";
import { cn } from "@/lib/cn";
import type { Level, WarningState } from "@/lib/domain/types";

/** The 30-second warning form (BLUEPRINT 2.2): person, rule, severity, optional note and photo. */
function WarningForm() {
  const { t, locale } = useLocale();
  const { venueId } = useVenue();
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const people = useQuery(api.warnings.people, venueId ? { venueId } : "skip");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const rules = useQuery(api.warnings.rulesFor, venueId && personId ? { venueId, userId: personId as Id<"users"> } : "skip");
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [ruleQuery, setRuleQuery] = useState("");
  const [severity, setSeverity] = useState<"minor" | "major" | null>(null);
  const [note, setNote] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; state: WarningState } | null>(null);
  const create = useRun(api.warnings.create, { silent: true });

  const person = people?.find((p) => p._id === personId) ?? null;
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    return (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || t(`roles.${p.role}`).toLowerCase().includes(q));
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
    create.reset();
    setOpenedAt(Date.now());
  };

  const submit = async () => {
    if (!venueId || !personId || !severity) return;
    const r = await create.run({
      venueId,
      userId: personId as Id<"users">,
      ruleId: ruleId ?? undefined,
      severity,
      note: note.trim() || undefined,
      photoId: (photoId as Id<"_storage">) ?? undefined,
      formMs: Date.now() - openedAt,
    });
    if (r) setDone({ name: person?.name ?? "", state: r.state as WarningState });
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 pt-10 text-center">
        <span className="check-pop flex size-16 items-center justify-center rounded-full bg-ok-bg text-ok-fg">
          <CheckCircle weight="fill" className="size-9" aria-hidden />
        </span>
        <div className="flex flex-col gap-2" role="status">
          <h1 className="text-title font-bold text-ink">{t("warnings.sentTitle")}</h1>
          <p className="text-body text-ink-muted">{t("warnings.sentBody", { name: done.name })}</p>
        </div>
        <StatusChip tone={STATE_TONES[done.state]}>{t(`states.${done.state}`)}</StatusChip>
        <div className="flex w-full max-w-sm flex-col gap-3 pt-4">
          <Button block onClick={reset}>
            {t("warnings.logAnother")}
          </Button>
          <ButtonLink href="/manage/warnings" variant="secondary" block>
            {t("warnings.backToList")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t("warnings.newTitle")} subtitle={t("warnings.newSubtitle")} back="/manage/warnings" />
      <div className="flex flex-col gap-7">
        <Section title={t("warnings.stepPerson")}>
          {person ? (
            <div className="flex min-h-target-lg items-center gap-3 rounded-card border border-ink bg-brand-soft px-4 py-2">
              <LevelBadge level={person.level as Level} label={t(`levels.${person.level}`)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-ink">{person.name}</span>
                <span className="text-small text-ink-muted">{t(`roles.${person.role}`)}</span>
              </span>
              <StatusChip tone={STATE_TONES[person.state as WarningState]} size="sm">
                {t(`states.${person.state}`)}
              </StatusChip>
              <button
                type="button"
                onClick={() => {
                  setPersonId(null);
                  setRuleId(null);
                }}
                aria-label={t("warnings.changePerson")}
                className="pressable flex size-target items-center justify-center rounded-full text-ink-muted"
              >
                <X weight="bold" className="size-5" />
              </button>
            </div>
          ) : people === undefined ? (
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
                      <LevelBadge level={p.level as Level} label={t(`levels.${p.level}`)} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-semibold text-ink">{p.name}</span>
                        <span className="text-small text-ink-muted">{t(`roles.${p.role}`)}</span>
                      </span>
                      {p.state !== "up_to_date" ? (
                        <StatusChip tone={STATE_TONES[p.state as WarningState]} size="sm">
                          {t(`states.${p.state}`)}
                        </StatusChip>
                      ) : null}
                    </button>
                  </li>
                ))}
                {filteredPeople.length === 0 ? <li className="px-4 py-4 text-body text-ink-muted">{t("warnings.noPeople")}</li> : null}
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
                    const on = r._id === ruleId;
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

        <InlineError>{create.message}</InlineError>
        {person ? (
          <Button block loading={create.busy} disabled={!ruleId || !severity} onClick={() => void submit()} icon={<PaperPlaneTilt weight="bold" className="size-5" />}>
            {t("warnings.send")}
          </Button>
        ) : null}
        {person ? <p className="text-small text-ink-muted">{t("warnings.privacyNote")}</p> : null}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="warnings.log">
      <WarningForm />
    </RequireAuth>
  );
}
