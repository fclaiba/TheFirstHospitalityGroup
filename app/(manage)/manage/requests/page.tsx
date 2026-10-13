"use client";

import { Bell, SquaresFour } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "@/lib/backend/hooks";
import { useLocale } from "@/lib/i18n-client";
import { money } from "@/lib/format";
import { can } from "@/lib/domain/permissions";
import { isApproval } from "@/lib/domain/requests";
import type { Role } from "@/lib/domain/types";
import { useCurrentShift, useMe } from "@/hooks/use-app";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/layout";
import { EmptyState, LockedState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";
import { RequestQueue } from "@/components/floor/request-queue";
import { ApprovalCard } from "@/components/floor/approval-card";

/** Live queue for the manager and captain (BLUEPRINT 6.1): approvals first, then service requests, then tonight's decisions. */
export default function ManageRequestsPage() {
  const { t, locale } = useLocale();
  const me = useMe();
  const role = (me?.role ?? "server") as Role;
  const allowed = !!me && can(role, "requests.queue");
  const { shift, loading } = useCurrentShift();
  const live = !!shift && (shift.status === "open" || shift.status === "closing");
  const open = useQuery(api.requests.open, allowed && live ? { shiftId: shift._id } : "skip");
  const all = useQuery(api.requests.forShift, allowed && live ? { shiftId: shift._id } : "skip");
  const company = useQuery(api.org.company, allowed ? {} : "skip");

  if (me && !allowed) return <LockedState title={t("common.noAccess")} />;
  if (loading || !me) return <ScreenSkeleton rows={4} />;
  if (!live) {
    return (
      <>
        <PageHeader title={t("requests.queueTitle")} />
        <LockedState title={t("requests.noShift")} body={t("requests.noShiftBody")} />
      </>
    );
  }
  if (open === undefined || all === undefined) return <ScreenSkeleton rows={4} />;

  const canDecide = role === "manager" || role === "owner" || role === "dev" || (role === "captain" && !!company?.captainApprovesComps);
  const approvals = open.filter((r) => isApproval(r.kind));
  const service = open.filter((r) => !isApproval(r.kind));
  const decided = all.filter((r) => r.status === "approved" || r.status === "denied");
  const approvedCents = decided.filter((r) => r.status === "approved").reduce((n, r) => n + (r.amountCents ?? 0), 0);
  const waiting = approvals.length + service.filter((r) => r.status === "open").length;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={t("requests.queueTitle")}
        eyebrow={`${t(`services.${shift.service}`)}, ${t(`shiftStatus.${shift.status}`)}`}
        action={
          can(role, "floor.sections") ? (
            <ButtonLink href="/manage/sections" variant="secondary" size="md" icon={<SquaresFour weight="bold" className="size-5" />}>
              {t("floor.assignTitle")}
            </ButtonLink>
          ) : undefined
        }
      />

      {!waiting && !service.length ? <EmptyState icon={<Bell weight="bold" />} title={t("requests.noneOpen")} body={t("requests.noneOpenBody")} /> : null}

      {approvals.length ? (
        <Section title={t("requests.approvals")}>
          <ul className="flex flex-col gap-3" aria-live="polite">
            {approvals.map((r) => (
              <ApprovalCard key={r._id} r={r} canDecide={canDecide && r.createdBy !== me.id} />
            ))}
          </ul>
        </Section>
      ) : null}

      {service.length ? (
        <Section title={t("requests.service")}>
          <RequestQueue requests={service} meId={me.id} />
        </Section>
      ) : null}

      <Section
        title={t("requests.decided")}
        action={approvedCents ? <StatusChip tone="neutral" size="sm">{t("requests.approvedTotal", { amount: money(locale, approvedCents) })}</StatusChip> : undefined}
      >
        {decided.length ? (
          <ul className="flex flex-col gap-3">
            {decided.map((r) => (
              <ApprovalCard key={r._id} r={r} canDecide={false} />
            ))}
          </ul>
        ) : (
          <p className="px-1 text-body text-ink-muted">{t("requests.noneDecided")}</p>
        )}
      </Section>
    </div>
  );
}
