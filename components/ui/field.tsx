"use client";

import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Field family (ported from OSCURA, re-tokened): label above, help optional, error below, never placeholder-as-label.
const control =
  "block w-full rounded-input border border-line-strong bg-canvas px-4 text-control text-ink placeholder:text-ink-subtle transition-[border-color,box-shadow] duration-(--duration-fast) focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus/20 aria-[invalid=true]:border-danger disabled:bg-surface disabled:text-ink-muted";

type FieldProps = {
  label: string;
  help?: ReactNode;
  error?: string;
  optional?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
};

export function Field({ label, help, error, optional, children, className }: FieldProps) {
  const id = useId();
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-small font-semibold text-ink">
        {label}
        {optional ? <span className="text-caption font-normal text-ink-subtle">{optional}</span> : null}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {help && !error ? (
        <p id={`${id}-help`} className="text-small text-ink-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-target-lg", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-3", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "select-caret h-target-lg appearance-none pr-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, disabled, describedBy }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describedBy?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-8 w-13 shrink-0 rounded-pill transition-colors duration-(--duration-base) disabled:opacity-45",
        checked ? "bg-brand" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 size-6 rounded-full bg-canvas shadow-card transition-transform duration-(--duration-base) ease-(--ease-spring)",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/** A labelled setting row with a switch, iOS settings style. */
export function SwitchRow({ label, help, checked, onChange, disabled }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-h-target-lg items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-body font-medium text-ink">{label}</p>
        {help ? (
          <p id={id} className="text-small text-ink-muted">
            {help}
          </p>
        ) : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} describedBy={help ? id : undefined} />
    </div>
  );
}
