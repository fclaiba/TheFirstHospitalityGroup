"use client";

import { useState } from "react";
import { CheckCircle, GraduationCap } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { pickLocalized } from "@/lib/domain/i18n";
import { dateShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StateChip } from "@/components/ui/status";
import { MenuPhoto } from "./parts";

/**
 * The menu quiz (ADR 0022, optional): for each item, tap its allergens. The answer is Passed or Not yet, never a
 * score (ADR 0027). Promotions to server and above can require it.
 */
export function MenuQuiz() {
  const { t, locale } = useLocale();
  const quiz = useQuery(api.menu.quiz, {});
  const submit = useRun(api.menu.submitQuiz);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<boolean | null>(null);
  if (quiz === undefined) return <ScreenSkeleton rows={3} />;
  if (!quiz.questions.length) return <EmptyState icon={<GraduationCap weight="bold" />} title={t("quiz.emptyTitle")} body={t("quiz.emptyBody")} />;

  if (result !== null) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader back="/menu" title={t("quiz.title")} />
        <div className={cn("flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center", result ? "bg-ok-bg" : "bg-attention-bg")}>
          <StateChip state={result ? "passed" : "not_yet"} />
          <p className="text-title-sm font-bold text-ink">{result ? t("quiz.passedTitle") : t("quiz.notYetTitle")}</p>
          <p className="max-w-[38ch] text-body text-ink-muted">{result ? t("quiz.passedBody") : t("quiz.notYetBody")}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setResult(null);
            setStep(0);
            setAnswers({});
          }}
        >
          {t("quiz.again")}
        </Button>
      </div>
    );
  }

  const q = quiz.questions[step]!;
  const picked = answers[q.itemId] ?? [];
  const last = step === quiz.questions.length - 1;
  const toggle = (a: string) => setAnswers((x) => ({ ...x, [q.itemId]: picked.includes(a) ? picked.filter((y) => y !== a) : [...picked, a] }));
  const finish = async () => {
    const r = await submit.run({ answers: quiz.questions.map((x) => ({ itemId: x.itemId as Id<"menuItems">, allergens: answers[x.itemId] ?? [] })) });
    if (r) setResult(r.passed);
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back="/menu"
        title={t("quiz.title")}
        subtitle={quiz.lastResult ? t("quiz.last", { state: t(`states.${quiz.lastResult.passed ? "passed" : "not_yet"}`), date: dateShort(locale, quiz.lastResult.at) }) : t("quiz.subtitle")}
      />
      <p className="text-small text-ink-muted" aria-live="polite">
        {t("quiz.step", { n: step + 1, total: quiz.questions.length })}
      </p>
      <div className="overflow-hidden rounded-card border border-line bg-surface-raised">
        <MenuPhoto url={q.photoUrl} alt={pickLocalized(q.name, locale)} />
        <div className="flex flex-col gap-1 p-4">
          <h2 className="text-title-sm font-bold text-ink">{pickLocalized(q.name, locale)}</h2>
          <p className="text-body text-ink-muted">{t("quiz.question")}</p>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t("quiz.question")}</legend>
        <div className="flex flex-wrap gap-2">
          {quiz.options.map((a) => {
            const on = picked.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(a)}
                className={cn(
                  "pressable inline-flex min-h-target items-center gap-1.5 rounded-pill border px-3.5 text-small font-semibold",
                  on ? "border-ink bg-ink text-on-ink" : "hover-line border-line-strong bg-canvas text-ink",
                )}
              >
                {on ? <CheckCircle weight="fill" className="size-4" aria-hidden /> : null}
                {t(`menu.allergen.${a}`)}
              </button>
            );
          })}
        </div>
        <p className="text-small text-ink-muted">{t("quiz.noneHint")}</p>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          {t("common.back")}
        </Button>
        {last ? (
          <Button loading={submit.busy} onClick={() => void finish()}>
            {t("quiz.finish")}
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)}>{t("common.next")}</Button>
        )}
      </div>
    </div>
  );
}
