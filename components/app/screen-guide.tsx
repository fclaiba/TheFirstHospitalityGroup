"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n-client";
import { guideFor } from "@/lib/screen-guide";

/** Immediate next step stays visible; detailed guidance is optional and keyboard accessible. */
export function ScreenGuide() {
  const pathname = usePathname();
  const t = useT();
  const guide = guideFor(pathname);
  if (!guide) return null;
  const [, key, section] = guide;
  return (
    <div className="mt-3 rounded-control border border-line bg-surface p-3 no-print" data-screen-guide>
      <p className="text-small text-ink"><strong className="font-semibold">{t("screenGuide.next")}: </strong>{t(`screenGuide.routes.${key}`)}</p>
      <details key={pathname} className="mt-1">
        <summary className="pressable flex min-h-target cursor-pointer items-center rounded-control text-small font-semibold text-brand">{t("screenGuide.details")}</summary>
        <p className="pb-2 text-small text-ink-muted">{t(section ? `guide.section.${section}.body` : "screenGuide.save")}</p>
        <Link href={section ? `/guide#${section}` : "/guide"} className="pressable inline-flex min-h-target items-center text-small font-semibold text-brand underline underline-offset-4">{t("screenGuide.full")}</Link>
      </details>
    </div>
  );
}
