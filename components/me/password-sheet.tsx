"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineError } from "@/components/ui/states";
import { useLocale } from "@/lib/i18n-client";
import { changePassword } from "@/lib/auth/client";
import { newPasswordSchema } from "@/schemas";
import { toast } from "@/lib/toast";

/** Change my password (BLUEPRINT 2.2): current, new and repeat. Other devices are signed out. */
export function PasswordSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLocale();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ next?: string; repeat?: string; form?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordSchema.safeParse(next).success) return setErrors({ next: t("password.short") });
    if (next !== repeat) return setErrors({ repeat: t("password.mismatch") });
    setErrors({});
    setBusy(true);
    const r = await changePassword(current, next);
    setBusy(false);
    if (!r.ok) {
      if (r.fields?.next === "same") return setErrors({ next: t("password.same") });
      return setErrors({ form: t(`errors.${r.error ?? "UNKNOWN"}`) });
    }
    toast(t("password.done"), "ok");
    setCurrent("");
    setNext("");
    setRepeat("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("password.changeTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-5 pb-4" noValidate>
        <Field label={t("password.current")}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        <Field label={t("password.next")} help={t("password.nextHelp")} error={errors.next}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label={t("password.repeat")} error={errors.repeat}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
        </Field>
        <InlineError>{errors.form}</InlineError>
        <Button type="submit" block loading={busy}>
          {t("password.submit")}
        </Button>
      </form>
    </Sheet>
  );
}
