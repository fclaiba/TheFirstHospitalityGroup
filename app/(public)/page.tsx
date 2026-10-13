import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Checks, ForkKnife, HandWaving } from "@phosphor-icons/react/dist/ssr";
import { TFHGMark, Wordmark } from "@/components/ui/brand";
import { InstallLink } from "@/components/app/install";
import { LangSwitch } from "@/components/app/lang-switch";
import { getT } from "@/lib/i18n-server";
import { currentSubject } from "@/lib/auth/session-server";

/** Brand page (BLUEPRINT 6.1): sign in and install. Signed-in people go straight to their day. */
export default async function Landing() {
  if (await currentSubject()) redirect("/start");
  const t = await getT();
  const points = [
    { icon: Checks, text: t("landing.point1") },
    { icon: ForkKnife, text: t("landing.point2") },
    { icon: HandWaving, text: t("landing.point3") },
  ];
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="flex items-center justify-between">
        <TFHGMark className="size-11 text-brand" title={t("brand.company")} />
        <LangSwitch />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-8 py-12">
        <div className="flex flex-col gap-5">
          <Wordmark className="h-5 w-auto self-start text-ink" />
          <h1 className="text-display font-bold text-ink">{t("landing.title")}</h1>
          <p className="max-w-[46ch] text-lead text-ink-muted">{t("landing.body")}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-body font-medium text-ink">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Icon weight="bold" className="size-5" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/login" className="pressable btn-primary inline-flex min-h-target-lg items-center justify-center gap-2 rounded-control bg-brand px-6 text-control font-semibold text-on-brand">
          {t("landing.signIn")}
          <ArrowRight weight="bold" className="size-5" aria-hidden />
        </Link>
        <InstallLink className="justify-center" />
        <p className="pt-2 text-center text-small text-ink-muted">{t("landing.staffOnly")}</p>
        <Link href="/legal/terms" className="mx-auto inline-flex min-h-target items-center text-small text-ink-muted underline underline-offset-4">
          {t("landing.legal")}
        </Link>
      </div>
    </main>
  );
}
