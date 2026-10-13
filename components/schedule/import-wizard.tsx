"use client";

import { useState } from "react";
import { FileArrowUp, Key, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { dateShort } from "@/lib/format";
import { POSITIONS } from "@/lib/domain/types";
import { useVenue } from "@/hooks/use-app";
import { useOnline } from "@/hooks/use-online";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { List, PageHeader, Row, Section } from "@/components/ui/layout";
import { InlineError, OfflineNote, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

// /company/setup/import (BLUEPRINT 7.2 imports.sevenShifts, 7.6): people, positions and the current schedule from a
// 7shifts CSV export. Check first (nothing saved), then import. Temporary passwords are shown once, to hand over in
// private; only their hashes are stored. Imported weeks are drafts the venue reviews and publishes.

const MAX_CSV = 500_000;
const MAPPABLE = POSITIONS.filter((p) => p !== "owner" && p !== "director" && p !== "dev");

type Result = {
  applied: boolean;
  report: {
    people: { new: number; existing: number; list: Array<{ name: string; email: string | null; primary: string; positions: string[]; existing: boolean }> };
    shifts: number;
    weeks: string[];
    unknownRoles: string[];
    errors: Array<{ line: number; message: string }>;
  };
  accounts: Array<{ name: string; username: string; tempPassword: string }>;
};

export function ImportWizard() {
  const { t, locale } = useLocale();
  const online = useOnline();
  const { venueId: current, venues } = useVenue();
  const [venueId, setVenueId] = useState<string | null>(null);
  const venue = (venueId ?? current) as Id<"venues"> | null;
  const [csv, setCsv] = useState("");
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const run = useRun(api.imports.sevenShifts);
  const history = useQuery(api.imports.history, {});

  if (!venue) return <ScreenSkeleton />;

  const mapArg = () => Object.entries(roleMap).filter(([, p]) => p).map(([role, position]) => ({ role, position }));
  const check = async () => {
    const r = await run.run({ venueId: venue, csv, roleMap: mapArg(), apply: false });
    if (r) setResult(r as Result);
  };
  const apply = async () => {
    const r = await run.run({ venueId: venue, csv, roleMap: mapArg(), apply: true });
    if (r) setResult(r as Result);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setTooLarge(file.size > MAX_CSV);
    if (file.size > MAX_CSV) return;
    setCsv(await file.text());
    setResult(null);
  };
  const errorText = (m: string) => {
    if (m.startsWith("not_enabled:")) {
      const [, name, position] = m.split(":");
      return t("schedule.import.error.not_enabled", { name: name ?? "", position: position ? t(`positions.${position}`) : "" });
    }
    return ["empty", "missing_name_column", "missing_role_column", "missing_name", "unknown_role", "bad_date_or_time"].includes(m) ? t(`schedule.import.error.${m}`) : m;
  };
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("schedule.import.title")} subtitle={t("schedule.import.subtitle")} back="/company/setup" />
      {!online ? <OfflineNote /> : null}

      {result?.applied ? (
        <section className="flex flex-col gap-4" aria-labelledby="accounts-title">
          <p role="status" className="rounded-card bg-ok-bg px-4 py-3 text-body font-semibold text-ok-fg">
            {t("schedule.import.applied")}
          </p>
          {result.accounts.length ? (
            <>
              <h2 id="accounts-title" className="text-title-sm font-bold text-ink">
                {t("schedule.import.accountsTitle")}
              </h2>
              <p className="flex items-start gap-2 rounded-card bg-attention-bg px-4 py-3 text-body text-ink">
                <WarningCircle weight="fill" aria-hidden className="mt-0.5 size-5 shrink-0 text-attention-fg" />
                {t("schedule.import.accountsWarning")}
              </p>
              <List>
                {result.accounts.map((a) => (
                  <Row
                    key={a.username}
                    leading={<Key weight="bold" className="size-5" />}
                    title={a.name}
                    subtitle={`${t("schedule.import.username")}: ${a.username}`}
                    trailing={<span className="font-mono text-body text-ink select-all">{a.tempPassword}</span>}
                  />
                ))}
              </List>
            </>
          ) : null}
        </section>
      ) : (
        <>
          {venues.length > 1 ? (
            <Field label={t("schedule.import.venue")}>
              {(p) => (
                <Select
                  {...p}
                  value={venue}
                  onChange={(e) => {
                    setVenueId(e.target.value);
                    setResult(null);
                  }}
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <Field label={t("schedule.import.file")} help={t("schedule.import.fileHelp")} error={tooLarge ? t("schedule.import.tooLarge") : undefined}>
            {(p) => <input {...p} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} className="block min-h-target w-full text-body text-ink file:mr-3 file:min-h-target file:rounded-control file:border file:border-line-strong file:bg-canvas file:px-4 file:font-semibold file:text-ink" />}
          </Field>
          <Field label={t("schedule.import.paste")} optional={t("common.optional")}>
            {(p) => (
              <Textarea
                {...p}
                spellCheck={false}
                className="font-mono"
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setResult(null);
                }}
              />
            )}
          </Field>

          {result?.report.unknownRoles.length ? (
            <Section title={t("schedule.import.roleMap")}>
              <p className="px-1 text-small text-ink-muted">{t("schedule.import.roleMapHelp")}</p>
              {result.report.unknownRoles.map((role) => (
                <Field key={role} label={role}>
                  {(p) => (
                    <Select {...p} value={roleMap[role] ?? ""} onChange={(e) => setRoleMap((m) => ({ ...m, [role]: e.target.value }))}>
                      <option value="">{t("common.none")}</option>
                      {MAPPABLE.map((pos) => (
                        <option key={pos} value={pos}>
                          {t(`positions.${pos}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
            </Section>
          ) : null}

          <Button variant={result ? "secondary" : "primary"} icon={<FileArrowUp weight="bold" />} loading={run.busy} disabled={!csv.trim() || !online} onClick={() => void check()}>
            {t("schedule.import.check")}
          </Button>
          <InlineError>{run.message}</InlineError>

          {result ? (
            <section className="flex flex-col gap-4" aria-labelledby="report-title">
              <p role="status" className="text-small text-ink-muted">
                {t("schedule.import.checked")}
              </p>
              <h2 id="report-title" className="text-title-sm font-bold text-ink">
                {t("schedule.import.reportTitle")}
              </h2>
              <ul className="flex flex-col gap-1 text-body text-ink">
                <li>{t("schedule.import.newPeople", { n: result.report.people.new })}</li>
                <li>{t("schedule.import.existingPeople", { n: result.report.people.existing })}</li>
                <li>{t("schedule.import.shifts", { n: result.report.shifts, weeks: result.report.weeks.length })}</li>
              </ul>
              {result.report.people.list.length ? (
                <List>
                  {result.report.people.list.map((p) => (
                    <Row
                      key={`${p.name}-${p.email ?? ""}`}
                      title={p.name}
                      subtitle={p.positions.map((x) => t(`positions.${x}`)).join(", ")}
                      trailing={
                        <StatusChip tone={p.existing ? "neutral" : "info"} size="sm" icon={false}>
                          {p.existing ? t("schedule.import.personExisting") : t("schedule.import.personNew")}
                        </StatusChip>
                      }
                    />
                  ))}
                </List>
              ) : null}
              {result.report.errors.length ? (
                <Section title={t("schedule.import.errors")}>
                  <ul className="flex flex-col gap-1 px-1 text-small text-ink">
                    {result.report.errors.map((e, i) => (
                      <li key={i}>{e.line ? t("schedule.import.errorLine", { line: e.line, message: errorText(e.message) }) : errorText(e.message)}</li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              <Button block icon={<UploadSimple weight="bold" />} loading={run.busy} disabled={!online || (!result.report.people.list.length && !result.report.shifts)} onClick={() => void apply()}>
                {t("schedule.import.apply")}
              </Button>
            </section>
          ) : null}
        </>
      )}

      <Section title={t("schedule.import.history")}>
        {history === undefined ? null : history.length ? (
          <List>
            {history.map((h) => (
              <Row key={h._id} title={`${dateShort(locale, h.at)}, ${venueName(h.venueId)}`} subtitle={t("schedule.import.historyLine", { people: h.people, shifts: h.shifts })} />
            ))}
          </List>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("schedule.import.historyEmpty")}</p>
        )}
      </Section>
    </div>
  );
}
