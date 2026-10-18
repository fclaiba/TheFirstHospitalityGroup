// Final lion artwork is pending (build blueprint 0.7). Keep one replaceable mark asset.
import type { SVGProps } from "react";

/** Retains the shared component contract while all screens use the neutral placeholder. */
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
