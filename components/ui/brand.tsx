// Original vector lion, ADR 0030. UI and generated install icons share this source.
import type { SVGProps } from "react";

/** Single-color silhouette with negative-space cuts for app-header sizes. */
export function LionMark({ title, simple, ...props }: Omit<SVGProps<SVGSVGElement>, "min"> & { title?: string; simple?: boolean }) {
  void simple;
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <use href="/brand/mark.svg#mark" />
    </svg>
  );
}

export function Wordmark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 239 52" fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <text x="0" y="38" className="font-sans text-title font-semibold tracking-wordmark">THE FIRST</text>
    </svg>
  );
}
