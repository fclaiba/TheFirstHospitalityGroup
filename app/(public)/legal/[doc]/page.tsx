import Link from "next/link";
import { notFound } from "next/navigation";
import { LionMark } from "@/components/ui/brand";
import { getT } from "@/lib/i18n-server";

const DOCS = ["terms", "privacy"] as const;

/** Terms and the internal staff privacy notice (BLUEPRINT 6.1, 8.4). */
export default async function Legal({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  if (!(DOCS as readonly string[]).includes(doc)) notFound();
  const t = await getT();
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 pt-[calc(1.5rem+var(--safe-top))] pb-16">
      <Link href="/" aria-label={t("brand.company")} className="w-fit text-brand">
        <LionMark className="size-10 text-brand" />
      </Link>
      <nav className="flex gap-4 text-small font-semibold">
        {DOCS.map((d) => (
          <Link key={d} href={`/legal/${d}`} aria-current={d === doc ? "page" : undefined} className={d === doc ? "text-ink underline underline-offset-4" : "text-ink-muted"}>
            {t(`legal.${d}`)}
          </Link>
        ))}
      </nav>
      <h1 className="text-title font-bold text-ink">{t(`legal.${doc}`)}</h1>
      <p className="text-body text-ink">{t(`legal.${doc}Body`)}</p>
      <p className="text-small text-ink-muted">{t("legal.updated")}</p>
    </main>
  );
}
