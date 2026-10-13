"use client";

import { useId, useRef, useState } from "react";
import { Camera, X } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "@/lib/backend/hooks";
import { uploadPhoto } from "@/lib/upload";
import type { UploadPurpose } from "@/lib/upload";
import { useT } from "@/lib/i18n-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { Spinner } from "./button";

/** Shows a stored photo through the access-checked files.url query (ADR 0005). */
export function StoredPhoto({ storageId, alt, className }: { storageId: string; alt: string; className?: string }) {
  const url = useQuery(api.files.url, { storageId: storageId as Id<"_storage"> });
  if (url === undefined) return <div className={cn("skeleton", className)} aria-hidden />;
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- storage URLs are short-lived and already compressed
  return <img src={url} alt={alt} className={cn("object-cover", className)} loading="lazy" decoding="async" />;
}

/**
 * Camera or library (BLUEPRINT 4.2): compresses to ≤ 400 KB before upload, shows the photo, lets the person change it.
 * `onChange` receives the storage id (or null when removed).
 */
export function PhotoField({ value, onChange, purpose, label, compact, disabled }: { value: string | null; onChange: (id: string | null) => void; purpose: UploadPurpose; label?: string; compact?: boolean; disabled?: boolean }) {
  const t = useT();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const register = useMutation(api.files.register);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const storageId = await uploadPhoto(file, purpose, {
        generateUploadUrl: () => generateUploadUrl({}),
        register: (a) => register({ storageId: a.storageId as Id<"_storage">, purpose: a.purpose }),
      });
      onChange(storageId);
    } catch (e) {
      const code = (e as { code?: string; data?: { code?: string } }).data?.code ?? (e as { code?: string }).code ?? "UNKNOWN";
      toast(t(`errors.${code}`), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="relative w-fit">
          <StoredPhoto storageId={value} alt={label ?? t("common.photo")} className={cn("rounded-card border border-line", compact ? "h-24 w-32" : "aspect-[4/3] w-64 max-w-full")} />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={t("common.remove")}
            className="pressable absolute -top-2 -right-2 flex size-9 items-center justify-center rounded-full bg-ink text-on-ink shadow-float"
          >
            <X weight="bold" className="size-4" />
          </button>
        </div>
      ) : null}
      <label
        htmlFor={id}
        className={cn(
          "pressable inline-flex min-h-target w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-line-strong px-4 text-control font-semibold text-ink",
          (busy || disabled) && "pointer-events-none opacity-60",
        )}
      >
        {busy ? <Spinner /> : <Camera weight="bold" className="size-5" aria-hidden />}
        {busy ? t("common.uploading") : value ? t("common.retakePhoto") : (label ?? t("common.addPhoto"))}
      </label>
      <input ref={input} id={id} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy || disabled} />
      <p className="text-caption text-ink-muted">{t("common.photoHint")}</p>
    </div>
  );
}
