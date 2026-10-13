"use client";

import { useMemo, useState } from "react";
import { Copy, Key, LockSimple, MagnifyingGlass, Plus, UserMinus, UserPlus } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useMe, useVenue } from "@/hooks/use-app";
import { ALCOHOL_ROLES, staffRoles } from "@/lib/domain/permissions";
import { LEVELS } from "@/lib/domain/types";
import type { Level, Locale, Role } from "@/lib/domain/types";
import { toast } from "@/lib/toast";
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, List } from "@/components/ui/layout";
import { Button, ConfirmButton } from "@/components/ui/button";
import { ChoicePills, Segmented } from "@/components/ui/choice";
import { Field, Input, Select, SwitchRow } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, InlineError, ScreenSkeleton } from "@/components/ui/states";
import { LevelBadge, StatusChip } from "@/components/ui/status";

type Person = { id: string; name: string; username: string; email: string | null; locale: string; role: string; level: string; active: boolean; mustChangePassword: boolean; venueIds: string[]; locked: boolean };
type Draft = { userId?: string; name: string; username: string; email: string; role: Role; level: Level; venueIds: string[]; locale: Locale; legalAge: boolean };

/** Shows a temporary password once, with copy (ADR 0003): the person must choose their own at first sign-in. */
function TempPassword({ value, name, onClose }: { value: string | null; name: string; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()} title={t("staff.tempTitle")} description={t("staff.tempBody", { name })}>
      <div className="flex flex-col gap-4 pb-4">
        <p className="rounded-card bg-surface p-5 text-center font-mono text-title-sm font-semibold tracking-wordmark text-ink select-all">{value}</p>
        <Button
          variant="secondary"
          icon={<Copy weight="bold" className="size-5" />}
          onClick={() => {
            if (value) void navigator.clipboard?.writeText(value).then(() => toast(t("staff.copied"), "ok"));
          }}
        >
          {t("staff.copy")}
        </Button>
        <p className="text-small text-ink-muted">{t("staff.tempOnce")}</p>
        <Button onClick={onClose}>{t("common.done")}</Button>
      </div>
    </Sheet>
  );
}

function PersonSheet({ draft, setDraft, onSaved }: { draft: Draft | null; setDraft: (d: Draft | null) => void; onSaved: (temp: string | null, name: string) => void }) {
  const { t } = useLocale();
  const me = useMe();
  const upsert = useRun(api.staff.upsert, { silent: true });
  const reset = useRun(api.staff.resetPassword, { silent: true });
  const deactivate = useRun(api.staff.deactivate, { success: t("staff.deactivated") });
  if (!draft || !me) return null;
  const roles = staffRoles(me.role as Role);
  const needsAge = ALCOHOL_ROLES.includes(draft.role);
  const f = upsert.fields;
  const save = async () => {
    const r = await upsert.run({
      userId: draft.userId as Id<"users"> | undefined,
      name: draft.name,
      username: draft.username,
      email: draft.email || undefined,
      role: draft.role,
      level: draft.level,
      venueIds: draft.venueIds as Id<"venues">[],
      locale: draft.locale,
      legalAgeConfirmed: needsAge ? draft.legalAge : undefined,
    });
    if (r) {
      setDraft(null);
      onSaved(r.tempPassword, draft.name);
      if (!r.tempPassword) toast(t("common.saved"), "ok");
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && setDraft(null)}
      title={draft.userId ? draft.name : t("staff.newTitle")}
      footer={
        <Button block loading={upsert.busy} onClick={() => void save()}>
          {draft.userId ? t("common.save") : t("staff.create")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label={t("staff.name")} error={f.name ? t("errors.INVALID_INPUT") : undefined}>
          {(p) => <Input {...p} autoComplete="off" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
        </Field>
        <Field label={t("staff.username")} help={t("staff.usernameHelp")} error={f.username ? (upsert.error?.code === "USERNAME_TAKEN" ? t("errors.USERNAME_TAKEN") : t("staff.usernameHelp")) : undefined}>
          {(p) => <Input {...p} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value.toLowerCase() })} />}
        </Field>
        <Field label={t("staff.email")} optional={t("common.optional")} help={t("staff.emailHelp")}>
          {(p) => <Input {...p} type="email" inputMode="email" autoCapitalize="none" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}
        </Field>
        <Field label={t("staff.role")}>
          {(p) => (
            <Select {...p} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-small font-semibold text-ink">{t("levels.label")}</p>
          <Segmented<Level> label={t("levels.label")} value={draft.level} onChange={(level) => setDraft({ ...draft, level })} options={LEVELS.map((l) => ({ value: l, label: t(`levels.${l}`) }))} />
        </div>
        {me.venues.length > 1 ? (
          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold text-ink">{t("staff.venues")}</p>
            <div className="flex flex-wrap gap-2">
              {me.venues.map((v) => {
                const on = draft.venueIds.includes(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft({ ...draft, venueIds: on ? draft.venueIds.filter((x) => x !== v.id) : [...draft.venueIds, v.id] })}
                    className={on ? "pressable inline-flex min-h-target items-center rounded-pill border border-ink bg-ink px-4 text-control font-medium text-on-ink" : "pressable hover-line inline-flex min-h-target items-center rounded-pill border border-line-strong px-4 text-control font-medium text-ink"}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
            {f.venueIds ? <p className="text-small font-medium text-danger">{t("staff.venueRequired")}</p> : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <p className="text-small font-semibold text-ink">{t("common.language")}</p>
          <ChoicePills<Locale>
            label={t("common.language")}
            value={draft.locale}
            onChange={(locale) => setDraft({ ...draft, locale })}
            options={[
              { value: "en", label: t("common.english") },
              { value: "es", label: t("common.spanish") },
            ]}
          />
        </div>
        {needsAge ? (
          <div className="rounded-card border border-line px-4">
            <SwitchRow label={t("staff.legalAge")} help={t("staff.legalAgeHelp")} checked={draft.legalAge} onChange={(legalAge) => setDraft({ ...draft, legalAge })} />
          </div>
        ) : null}
        {f.legalAgeConfirmed ? <p className="text-small font-medium text-danger">{t("staff.legalAgeRequired")}</p> : null}
        <InlineError>{upsert.error && !Object.keys(f).length ? upsert.message : null}</InlineError>
        {draft.userId ? (
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <Button
              variant="secondary"
              icon={<Key weight="bold" className="size-5" />}
              loading={reset.busy}
              onClick={async () => {
                const r = await reset.run({ userId: draft.userId as Id<"users"> });
                if (r) {
                  setDraft(null);
                  onSaved(r.tempPassword, draft.name);
                } else if (reset.message) toast(reset.message, "error");
              }}
            >
              {t("staff.resetPassword")}
            </Button>
            <ConfirmButton
              block
              confirmLabel={t("staff.deactivateConfirm")}
              icon={<UserMinus weight="bold" className="size-5" />}
              loading={deactivate.busy}
              onConfirm={async () => {
                const r = await deactivate.run({ userId: draft.userId as Id<"users"> });
                if (r) setDraft(null);
              }}
            >
              {t("staff.deactivate")}
            </ConfirmButton>
            <p className="text-small text-ink-muted">{t("staff.deactivateHelp")}</p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Staff accounts of the venue (ADR 0003): create with a temporary password, edit, level, reset, deactivate. */
function StaffSetup() {
  const { t } = useLocale();
  const me = useMe();
  const { venueId } = useVenue();
  const [showInactive, setShowInactive] = useState(false);
  const list = useQuery(api.staff.list, venueId ? { venueId, includeInactive: showInactive } : "skip");
  const reactivate = useRun(api.staff.deactivate, { success: t("staff.reactivated") });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [temp, setTemp] = useState<{ value: string; name: string } | null>(null);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ((list ?? []) as Person[]).filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.includes(q));
  }, [list, query]);

  const edit = (p: Person) =>
    setDraft({ userId: p.id, name: p.name, username: p.username, email: p.email ?? "", role: p.role as Role, level: p.level as Level, venueIds: p.venueIds, locale: p.locale as Locale, legalAge: true });
  const create = () =>
    setDraft({ name: "", username: "", email: "", role: "server", level: "C", venueIds: venueId ? [venueId] : [], locale: (me?.locale as Locale) ?? "en", legalAge: false });

  return (
    <>
      <PageHeader
        title={t("staff.title")}
        subtitle={t("staff.subtitle")}
        back="/manage/setup"
        action={
          <Button size="md" icon={<Plus weight="bold" className="size-5" />} onClick={create}>
            {t("staff.add")}
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">{t("common.search")}</span>
          <MagnifyingGlass weight="bold" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("staff.search")} className="pl-12" />
        </label>
        <div className="rounded-card border border-line px-4">
          <SwitchRow label={t("staff.showInactive")} checked={showInactive} onChange={setShowInactive} />
        </div>
      </div>
      {list === undefined ? (
        <ScreenSkeleton />
      ) : people.length === 0 ? (
        <EmptyState icon={<UserPlus weight="bold" />} title={t("staff.emptyTitle")} body={t("staff.emptyBody")} />
      ) : (
        <List>
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => (p.active ? edit(p) : void reactivate.run({ userId: p.id as Id<"users">, active: true }))}
                className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2.5 text-left"
              >
                <LevelBadge level={p.level as Level} label={t(`levels.${p.level}`)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-ink">{p.name}</span>
                  <span className="truncate text-small text-ink-muted">
                    {t(`roles.${p.role}`)}, <span className="font-mono">{p.username}</span>
                  </span>
                </span>
                {!p.active ? (
                  <StatusChip tone="neutral" size="sm" icon={false}>
                    {t("staff.inactive")}
                  </StatusChip>
                ) : p.locked ? (
                  <StatusChip tone="attention" size="sm" icon={<LockSimple weight="bold" />}>
                    {t("staff.locked")}
                  </StatusChip>
                ) : p.mustChangePassword ? (
                  <StatusChip tone="info" size="sm" icon={false}>
                    {t("staff.pending")}
                  </StatusChip>
                ) : null}
              </button>
            </li>
          ))}
        </List>
      )}
      <PersonSheet draft={draft} setDraft={setDraft} onSaved={(value, name) => value && setTemp({ value, name })} />
      <TempPassword value={temp?.value ?? null} name={temp?.name ?? ""} onClose={() => setTemp(null)} />
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="staff.manage">
      <StaffSetup />
    </RequireAuth>
  );
}
