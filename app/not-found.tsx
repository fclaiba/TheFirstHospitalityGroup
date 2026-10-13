import Link from "next/link";
import { LionMark } from "@/components/ui/brand";
import { getT } from "@/lib/i18n-server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-6">
      <LionMark className="size-14 text-brand" />
      <div>
        <h1 className="text-title font-bold text-ink">{t("common.notFoundTitle")}</h1>
        <p className="mt-2 text-body text-ink-muted">{t("common.notFoundBody")}</p>
      </div>
      <Link href="/today" className="pressable btn-primary inline-flex min-h-target-lg w-fit items-center rounded-control bg-brand px-6 text-control font-semibold text-on-brand">
        {t("common.goHome")}
      </Link>
    </main>
  );
}
