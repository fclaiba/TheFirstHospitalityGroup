"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { Compass } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import { GUIDE_REQUEST_SLOT } from "@/lib/guides/request-slot";
import { report } from "@/lib/report";
import type { WalkthroughProps } from "./walkthrough";

/** One consistent entry on every route; the walkthrough itself is downloaded only when requested. */
export function InteractiveGuide() {
  const path = usePathname();
  const t = useT();
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty(
        "--guide-bar-height",
        `${Math.ceil(element.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--guide-bar-height");
    };
  }, []);
  return (
    <aside
      ref={bar}
      data-guide-utility
      data-tour-ui
      aria-label={t("tour.tools")}
      className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas pt-(--safe-top) no-print"
    >
      <div className="mx-auto flex min-h-target w-full max-w-3xl flex-wrap items-center gap-3 px-4">
        <div id={GUIDE_REQUEST_SLOT} className="shrink-0 empty:hidden" />
        <GuideLauncher key={path} path={path} />
      </div>
    </aside>
  );
}
export function GuideLauncher({
  path,
  scopeId,
  task,
}: {
  path: string;
  scopeId?: string;
  task?: { title: string; description?: string };
}) {
  const t = useT();
  const button = useRef<HTMLButtonElement>(null);
  const [Panel, setPanel] = useState<ComponentType<WalkthroughProps> | null>(
      null,
    ),
    [loading, setLoading] = useState(false),
    [open, setOpen] = useState(false),
    [failed, setFailed] = useState(false);
  async function launch() {
    setLoading(true);
    setFailed(false);
    try {
      const guideModule = await import("./walkthrough");
      setPanel(() => guideModule.Walkthrough);
      setOpen(true);
    } catch (error) {
      report(error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Button
        ref={button}
        variant="quiet"
        size="md"
        loading={loading}
        icon={<Compass className="hidden size-5 sm:block" aria-hidden />}
        className="ml-auto min-w-0 [&>span]:overflow-visible [&>span]:text-clip [&>span]:whitespace-normal"
        onClick={launch}
      >
        {t("tour.open")}
      </Button>
      {failed ? (
        <div
          role="alert"
          className="fixed top-(--guide-bar-height) right-4 z-50 flex w-[calc(100vw-var(--tour-gap)*2)] max-w-sm flex-col gap-3 rounded-card border border-review-fg bg-canvas p-4 shadow-sheet"
        >
          <p className="text-body text-ink">{t("tour.loadError")}</p>
          <div className="flex flex-wrap gap-2">
            <Button autoFocus size="md" onClick={launch}>
              {t("tour.retry")}
            </Button>
            <Button
              size="md"
              variant="secondary"
              onClick={() => {
                setFailed(false);
                requestAnimationFrame(() =>
                  button.current?.focus({ preventScroll: true }),
                );
              }}
            >
              {t("common.close")}
            </Button>
          </div>
        </div>
      ) : null}
      {open && Panel ? (
        <Panel
          path={path}
          scopeId={scopeId}
          task={task}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() =>
              button.current?.focus({ preventScroll: true }),
            );
          }}
        />
      ) : null}
    </>
  );
}
