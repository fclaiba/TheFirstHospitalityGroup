"use client";

import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { PEOPLE, VENUES } from "@/convex/seedData";
import { DEMO_PASSWORD } from "@/lib/demo/accounts";
import { signIn } from "@/lib/auth/client";
import { reseed } from "@/lib/demo/store";
import { useT } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { Spinner, TextButton } from "@/components/ui/button";
import { LevelBadge } from "@/components/ui/status";
import type { Level } from "@/lib/domain/types";

/** Preview only (ADR 0010): sign in as any demo person, one tap, to walk the owner through every role. */
export function DemoAccounts({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const groups = [
    { title: t("roles.owner"), people: PEOPLE.filter((p) => p.role === "owner") },
    { title: VENUES[0]!.name, people: PEOPLE.filter((p) => p.venues[0] === "v1") },
    { title: t("nav.owner"), people: PEOPLE.filter((p) => p.role !== "owner" && p.venues[0] !== "v1") },
  ];
  const pick = async (username: string) => {
    setBusy(username);
    const r = await signIn(username, DEMO_PASSWORD);
    setBusy(null);
    if (r.ok) onSignedIn();
    else toast(t(`errors.${r.error ?? "UNKNOWN"}`), "error");
  };
  return (
    <section aria-labelledby="demo-title" className="mt-10 flex flex-col gap-4 border-t border-line pt-8">
      <div className="flex flex-col gap-1">
        <h2 id="demo-title" className="text-title-sm font-bold text-ink">
          {t("login.demoTitle")}
        </h2>
        <p className="text-small text-ink-muted">{t("login.demoBody", { password: DEMO_PASSWORD })}</p>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <h3 className="px-1 text-small font-semibold tracking-label text-ink-muted uppercase">{g.title}</h3>
          <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line">
            {g.people.map((p) => (
              <li key={p.username}>
                <button
                  type="button"
                  onClick={() => void pick(p.username)}
                  disabled={!!busy}
                  className="pressable-row hover-surface flex min-h-target-lg w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-60"
                >
                  <LevelBadge level={p.level as Level} label={t(`levels.${p.level}`)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-ink">{p.name}</span>
                    <span className="truncate text-small text-ink-muted">
                      {t(`roles.${p.role}`)}
                      {p.venues[0] && g.title === t("nav.owner") ? `, ${VENUES.find((v) => v.key === p.venues[0])?.name}` : ""}
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
        onClick={() => void reseed().then(() => toast(t("login.demoResetDone"), "ok"))}
        className="self-start"
      >
        {t("login.demoReset")}
      </TextButton>
    </section>
  );
}
