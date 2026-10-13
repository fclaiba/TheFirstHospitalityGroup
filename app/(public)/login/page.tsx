"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeSlash, SignIn } from "@phosphor-icons/react";
import { TFHGMark } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineError } from "@/components/ui/states";
import { LangSwitch } from "@/components/app/lang-switch";
import { DemoAccounts } from "@/components/app/demo-accounts";
import { useT } from "@/lib/i18n-client";
import { signIn } from "@/lib/auth/client";
import { PREVIEW } from "@/lib/backend/config";

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (mustChange?: boolean) => {
    const next = params.get("next");
    router.replace(mustChange ? "/login/password" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/start");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) return setError("INVALID_CREDENTIALS");
    setBusy(true);
    setError(null);
    const r = await signIn(login, password);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "UNKNOWN");
    go(r.mustChangePassword);
  };

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[calc(1rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label={t("brand.company")} className="pressable flex size-target items-center justify-center rounded-control text-brand">
          <TFHGMark className="size-10" />
        </Link>
        <LangSwitch />
      </div>
      <div className="flex flex-col gap-2 pt-10 pb-8">
        <h1 className="text-title font-bold text-ink">{t("login.title")}</h1>
        <p className="text-body text-ink-muted">{t("login.subtitle")}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={t("login.login")} help={t("login.loginHelp")}>
          {(p) => (
            <Input
              {...p}
              name="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
            />
          )}
        </Field>
        <Field label={t("login.password")}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                name="password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                enterKeyHint="go"
                className="pr-14"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t("login.hide") : t("login.show")}
                aria-pressed={show}
                className="pressable absolute top-1/2 right-1 flex size-target -translate-y-1/2 items-center justify-center rounded-control text-ink-muted"
              >
                {show ? <EyeSlash weight="bold" className="size-5" /> : <Eye weight="bold" className="size-5" />}
              </button>
            </div>
          )}
        </Field>
        <InlineError>{error ? t(`errors.${error}`) : null}</InlineError>
        <Button type="submit" block loading={busy} icon={<SignIn weight="bold" className="size-5" />}>
          {t("login.submit")}
        </Button>
      </form>
      <div className="mt-4 flex flex-col items-start gap-1">
        {!PREVIEW ? (
          <Link href="/login/recover" className="inline-flex min-h-target items-center text-small font-medium text-ink underline underline-offset-4">
            {t("login.forgot")}
          </Link>
        ) : null}
        <p className="text-small text-ink-muted">{t("login.forgotStaff")}</p>
      </div>
      {PREVIEW ? <DemoAccounts onSignedIn={() => go(false)} /> : null}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
