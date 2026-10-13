"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Buttons (BLUEPRINT 4.2, ADR 0009): primary martini green (one per screen), secondary ink outline, quiet text,
// destructive only through the two-tap ConfirmButton. Press feedback on pointer-down (.pressable).
type Variant = "primary" | "secondary" | "quiet" | "destructive" | "ink";
type Size = "md" | "lg";

const base =
  "pressable relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "btn-primary bg-brand text-on-brand active:bg-brand-pressed",
  secondary: "btn-secondary border border-line-strong bg-canvas text-ink active:bg-surface",
  ink: "bg-ink text-on-ink",
  quiet: "hover-surface text-ink active:bg-surface",
  destructive: "border border-danger bg-canvas text-danger",
};

const sizes: Record<Size, string> = {
  md: "min-h-target px-4 text-control",
  lg: "min-h-target-lg px-6 text-control",
};

type Common = { variant?: Variant; size?: Size; icon?: ReactNode; loading?: boolean; block?: boolean };

export function Button({ variant = "primary", size = "lg", icon, loading, block, className, children, disabled, ...props }: Common & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], block && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children ? <span className="truncate">{children}</span> : null}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "lg", icon, block, className, children, ...props }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && "w-full", className)} {...props}>
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function IconButton({ label, className, children, ...props }: { label: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("pressable hover-surface inline-flex size-target shrink-0 items-center justify-center rounded-full text-ink active:bg-surface", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextButton({ className, children, icon, ...props }: { icon?: ReactNode } & ComponentProps<"button">) {
  return (
    <button type="button" className={cn("hover-ink inline-flex min-h-target items-center gap-2 text-small font-medium text-ink-muted underline underline-offset-4", className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

/**
 * Two-tap destructive action: the first tap arms it (label changes, red outline), the second confirms.
 * Disarms itself after 4 s. No modal (ported from OSCURA).
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel,
  children,
  icon,
  variant = "secondary",
  size = "md",
  className,
  loading,
  disabled,
  block,
}: {
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: Exclude<Variant, "destructive">;
  size?: Size;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <Button
      variant={armed ? "destructive" : variant}
      size={size}
      icon={icon}
      className={className}
      loading={loading}
      disabled={disabled}
      block={block}
      aria-live="polite"
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        void onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
