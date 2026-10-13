"use client";

import { useMemo, useState } from "react";
import { Plus, SealWarning } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow, useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { useCan, useVenue } from "@/hooks/use-app";
import { RequireAuth } from "@/components/app/require-auth";
import { PageHeader, Section } from "@/components/ui/layout";
import { ButtonLink, ConfirmButton } from "@/components/ui/button";
import { ChoicePills } from "@/components/ui/choice";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { Sheet } from "@/components/ui/sheet";
import { Field, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { WarningCard } from "@/components/warnings/warning-card";

type Filter = "all" | "open" | "major" | "unacknowledged";

function VoidSheet({ warningId, onClose }: { warningId: string | null; onClose: () => void }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const voidRun = useRun(api.warnings.void, { success: t("warnings.voidDone") });
  return (
    <Sheet
      open={!!warningId}
      onOpenChange={(o) => !o && onClose()}
      title={t("warnings.voidTitle")}
      description={t("warnings.voidBody")}
      footer={
        <Button
          block
          variant="ink"
          disabled={!reason.trim()}
          loading={voidRun.busy}
          onClick={async () => {
            const r = await voidRun.run({ warningId: warningId as Id<"warnings">, reason: reason.trim() });
            if (r) {
              setReason("");
              onClose();
            }
          }}
        >
          {t("warnings.voidConfirm")}
        </Button>
      }
    >
      <Field label={t("warnings.voidReason")}>{(p) => <Textarea {...p} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
    </Sheet>
  );
}

function WarningsList() {
  const { t } = useLocale();
  const now = useNow();
  const { venueId } = useVenue();
  const canLog = useCan("warnings.log");
  const data = useQuery(api.warnings.forVenue, venueId ? { venueId } : "skip");
  const [filter, setFilter] = useState<Filter>("open");
  const [voiding, setVoiding] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "open") return all.filter((w) => !w.voidedAt && w.counts);
    if (filter === "major") return all.filter((w) => !w.voidedAt && w.severity === "major");
    if (filter === "unacknowledged") return all.filter((w) => !w.voidedAt && !w.acknowledgedAt);
    return all;
  }, [data, filter]);

  return (
    <>
      <PageHeader
        title={t("warnings.title")}
        subtitle={t("warnings.subtitle")}
        action={
          canLog ? (
            <ButtonLink href="/manage/warnings/new" size="md" icon={<Plus weight="bold" className="size-5" />}>
              {t("warnings.log")}
            </ButtonLink>
          ) : null
        }
      />
      <ChoicePills<Filter>
        label={t("warnings.filter")}
        value={filter}
        onChange={setFilter}
        className="mb-5"
        options={[
          { value: "open", label: t("warnings.filterOpen") },
          { value: "unacknowledged", label: t("warnings.filterUnack") },
          { value: "major", label: t("warnings.filterMajor") },
          { value: "all", label: t("common.all") },
        ]}
      />
      {data === undefined ? (
        <ScreenSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<SealWarning weight="bold" />} title={t("warnings.emptyTitle")} body={t("warnings.emptyBody")} />
      ) : (
        <Section>
          <ul className="flex flex-col gap-3">
            {items.map((w) => (
              <li key={w._id}>
                <WarningCard
                  w={w}
                  footer={
                    data.canVoid && !w.voidedAt && now < w.canVoidUntil ? (
                      <ConfirmButton size="md" confirmLabel={t("warnings.voidArm")} onConfirm={() => setVoiding(w._id)} className="self-start">
                        {t("warnings.void")}
                      </ConfirmButton>
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <VoidSheet warningId={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth action="warnings.read_venue">
      <WarningsList />
    </RequireAuth>
  );
}
