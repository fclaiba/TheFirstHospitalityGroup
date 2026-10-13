"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKey } from "@phosphor-icons/react";
import { TFHGMark } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineError } from "@/components/ui/states";
import { useT } from "@/lib/i18n-client";
import { changePassword } from "@/lib/auth/client";
import { newPasswordSchema } from "@/schemas";

/** Forced password change (ADR 0003): first sign-in with a temporary password, a reset, or an email code. */
export default function ChoosePassword() {
  const t = useT();
  const router = useRouter();
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ next?: string; repeat?: string }>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPasswordSchema.safeParse(next).success) return setFieldError({ next: t("password.short") });
    if (next !== repeat) return setFieldError({ repeat: t("password.mismatch") });
    setFieldError({});
    setBusy(true);
    const r = await changePassword(undefined, next);
    setBusy(false);
    if (!r.ok) {
      if (r.fields?.next === "same") return setFieldError({ next: t("password.same") });
      return setError(r.error ?? "UNKNOWN");
    }
    router.replace("/start");
  };

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[calc(1.5rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <TFHGMark className="size-10 text-brand" />
      <div className="flex flex-col gap-2 pt-10 pb-8">
        <h1 className="text-title font-bold text-ink">{t("password.title")}</h1>
        <p className="text-body text-ink-muted">{t("password.body")}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={t("password.next")} help={t("password.nextHelp")} error={fieldError.next}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} enterKeyHint="next" />}
        </Field>
        <Field label={t("password.repeat")} error={fieldError.repeat}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} enterKeyHint="done" />}
        </Field>
        <InlineError>{error ? t(`errors.${error}`) : null}</InlineError>
        <Button type="submit" block loading={busy} icon={<LockKey weight="bold" className="size-5" />}>
          {t("password.submit")}
        </Button>
      </form>
    </main>
  );
}
