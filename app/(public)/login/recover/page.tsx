"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TFHGMark } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineError } from "@/components/ui/states";
import { useT } from "@/lib/i18n-client";
import { requestCode, verifyCode } from "@/lib/auth/client";

/** Email-code recovery for managers and owners (BLUEPRINT 2.2). Staff ask their manager for a reset. */
export default function Recover() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await requestCode(email);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "UNKNOWN");
    setSent(true);
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await verifyCode(email, code);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "INVALID_CODE");
    router.replace("/login/password");
  };

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[calc(1.5rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <TFHGMark className="size-10 text-brand" />
      <div className="flex flex-col gap-2 pt-10 pb-8">
        <h1 className="text-title font-bold text-ink">{t("recover.title")}</h1>
        <p className="text-body text-ink-muted">{sent ? t("recover.sent") : t("recover.body")}</p>
      </div>
      {!sent ? (
        <form onSubmit={send} className="flex flex-col gap-5" noValidate>
          <Field label={t("recover.email")}>
            {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <InlineError>{error ? t(`errors.${error}`) : null}</InlineError>
          <Button type="submit" block loading={busy}>
            {t("recover.send")}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-5" noValidate>
          <Field label={t("recover.code")}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono tracking-wordmark"
              />
            )}
          </Field>
          <InlineError>{error ? t(`errors.${error}`) : null}</InlineError>
          <Button type="submit" block loading={busy} disabled={code.length !== 6}>
            {t("recover.verify")}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-flex min-h-target items-center text-small font-medium text-ink underline underline-offset-4">
        {t("recover.back")}
      </Link>
    </main>
  );
}
