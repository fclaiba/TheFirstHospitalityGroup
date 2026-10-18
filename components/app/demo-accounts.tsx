"use client";

import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { PEOPLE, VENUES } from "@/convex/seedData";
import { DEMO_PASSWORD } from "@/lib/demo/accounts";
import { signIn } from "@/lib/auth/client";
import { reseed, useDemoStore } from "@/lib/demo/store";
import { useT } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { Spinner, TextButton } from "@/components/ui/button";
import { PositionBadge } from "@/components/ui/status";
import { AREAS } from "@/lib/domain/types";
import { areaOf } from "@/lib/domain/positions";
import { Field, Input } from "@/components/ui/field";
import { InlineError } from "@/components/ui/states";

/** Preview only (ADR 0010): sign in as any demo person, one tap, to walk the owner through every position, by area. */
export function DemoAccounts({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ready = useDemoStore((s) => s.hydrated);
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const people = PEOPLE.filter((p) => p.position !== "dev" && normalize(`${p.name} ${p.username} ${t(`positions.${p.position}`)} ${p.venues.map((key) => VENUES.find((v) => v.key === key)?.name).join(" ")}`).includes(normalize(search)));
  const featured = new Set(["ana.p", "maria.m", "owner"]);
  const midtown = people.filter((p) => !featured.has(p.username) && (p.venues[0] === "v1" || p.venues.length === 0));
  const groups = [
    { key: "start", title: t("login.demoStart"), people: people.filter((p) => featured.has(p.username)).sort((a, b) => [...featured].indexOf(a.username) - [...featured].indexOf(b.username)) },
    ...AREAS.map((area) => ({ key: area, title: t(`areas.${area}`), people: midtown.filter((p) => areaOf(p.position) === area) })),
    { key: "others", title: t("login.demoOtherVenues"), people: people.filter((p) => !featured.has(p.username) && p.venues[0] && p.venues[0] !== "v1") },
  ].filter((g) => g.people.length);

  const pick = async (username: string) => {
    setBusy(username);
    setError(null);
    try {
      const r = await signIn(username, DEMO_PASSWORD);
      if (r.ok) onSignedIn();
      else setError(t(`errors.${r.error ?? "UNKNOWN"}`));
    } catch {
      setError(t("errors.UNKNOWN"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="demo-title" className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-1">
        <h2 id="demo-title" className="text-title-sm font-bold text-ink">
          {t("login.demoTitle")}
        </h2>
        <p className="text-small text-ink-muted">{t("login.demoBody", { password: DEMO_PASSWORD })}</p>
      </div>
      <Field label={t("login.demoSearch")}>
        {(props) => <Input {...props} type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />}
      </Field>
      <p role="status" className="text-small text-ink-muted">{!ready ? t("login.demoPreparing") : busy ? t("login.demoOpening") : t("login.demoHint")}</p>
      <InlineError>{error}</InlineError>
      {!groups.length ? <p className="text-body text-ink-muted">{t("login.demoEmpty")}</p> : null}
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <h3 className="px-1 text-small font-semibold tracking-label text-ink-muted uppercase">{g.title}</h3>
          <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line">
            {g.people.map((p) => (
              <li key={p.username}>
                <button
                  type="button"
                  onClick={() => void pick(p.username)}
                  disabled={!!busy || !ready}
                  className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-60"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-body font-semibold text-ink">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PositionBadge position={p.position} />
                      {g.key === "others" ? <span className="truncate text-small text-ink-muted">{VENUES.find((v) => v.key === p.venues[0])?.name}</span> : null}
                    </span>
                  </span>
                  {busy === p.username ? <Spinner className="text-brand" /> : <span className="font-mono text-caption text-ink-subtle">{p.username}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <TextButton
        icon={<ArrowCounterClockwise weight="bold" className="size-4" />}
        disabled={!!busy || !ready}
        onClick={() => { setBusy("reset"); void reseed().then(() => { setError(null); toast(t("login.demoResetDone"), "ok"); }).catch(() => setError(t("errors.UNKNOWN"))).finally(() => setBusy(null)); }}
        className="self-start"
      >
        {t("login.demoReset")}
      </TextButton>
    </section>
  );
}
