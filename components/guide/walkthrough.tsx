"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n-client";
import { buildSteps } from "@/lib/guides/plan";
import type { Candidate, StepKind } from "@/lib/guides/plan";
import { guideFor } from "@/lib/screen-guide";
import { Button } from "@/components/ui/button";

export type WalkthroughProps = {
  path: string;
  onClose: () => void;
  scopeId?: string;
  task?: { title: string; description?: string };
};
type Step = Candidate & { element: HTMLElement };
type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
  vw: number;
  vh: number;
  panelTop: number;
  panelLeft: number;
};
const text = (element: HTMLElement) =>
  element.getAttribute("aria-label") ??
  element.innerText
    .split("\n")
    .find((line) => line.trim())
    ?.replace(/\s+/g, " ")
    .trim() ??
  "";
function visible(element: HTMLElement) {
  const r = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    r.width > 0 &&
    r.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    !element.closest("[hidden],[data-tour-ui],[data-screen-guide]")
  );
}
function collect(
  fallback: string,
  navigation: string,
  scopeId?: string,
): Step[] {
  const main =
    (scopeId
      ? document.getElementById(scopeId)
      : document.querySelector<HTMLElement>("main")) ?? document.body;
  const title =
    main.querySelector<HTMLElement>("h1") ??
    main.querySelector<HTMLElement>("h2") ??
    main;
  const steps: Step[] = [
    {
      id: "overview",
      kind: "overview",
      label: title === main ? fallback : text(title),
      visible: true,
      element: title,
    },
  ];
  let seq = 0;
  const add = (element: HTMLElement, kind: StepKind, label: string) => {
    steps.push({
      id: `step-${seq++}`,
      kind,
      label: label.slice(0, 160),
      visible: visible(element),
      disabled: element.matches(":disabled,[aria-disabled=true]"),
      element,
    });
  };
  for (const el of main.querySelectorAll<HTMLElement>(
    "h2,label,button,a[href],summary,[role=alert],[role=radio],[role=switch]",
  )) {
    if (el === title || el.closest("[data-screen-guide],[data-tour-ui]"))
      continue;
    if (el.tagName === "LABEL") {
      const control = document.getElementById((el as HTMLLabelElement).htmlFor);
      if (control)
        add(
          control,
          control.tagName === "SELECT" ? "choice" : "field",
          text(el),
        );
    } else if (el.tagName === "H2") add(el, "section", text(el));
    else if (el.getAttribute("role") === "alert") add(el, "status", text(el));
    else if (el.matches("[role=radio],[role=switch]"))
      add(el, "choice", text(el));
    else
      add(
        el,
        el.tagName === "A"
          ? "link"
          : el.tagName === "SUMMARY"
            ? "details"
            : "action",
        text(el),
      );
  }
  const nav = scopeId
    ? null
    : document.querySelector<HTMLElement>("nav[aria-label]");
  if (nav) add(nav, "navigation", navigation);
  return buildSteps(steps);
}
export function Walkthrough({
  path,
  onClose,
  scopeId,
  task,
}: WalkthroughProps) {
  const t = useT(),
    id = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const originalScroll = useRef({ x: window.scrollX, y: window.scrollY });
  const [steps] = useState(() =>
      collect(task?.title ?? t("tour.screen"), t("tour.navigation"), scopeId),
    ),
    [index, setIndex] = useState(0),
    [box, setBox] = useState<Box | null>(null);
  const step = steps[index]!;
  const guide = guideFor(path);
  const intro = task
    ? `${t("tour.task", { title: task.title })}${task.description ? ` ${task.description}` : ""}`
    : guide
      ? t(`screenGuide.routes.${guide[1]}`)
      : path.startsWith("/login")
        ? t("tour.login")
        : path.startsWith("/legal")
          ? t("tour.legal")
          : t("tour.intro");
  useLayoutEffect(() => {
    const modal = dialog.current;
    const initialScroll = originalScroll.current;
    const parents = new Set<HTMLElement>();
    for (const item of steps) {
      let parent = item.element.parentElement;
      while (parent) {
        if (
          parent.scrollHeight > parent.clientHeight ||
          parent.scrollWidth > parent.clientWidth
        )
          parents.add(parent);
        parent = parent.parentElement;
      }
    }
    const positions = Array.from(parents, (element) => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
    modal?.showModal();
    return () => {
      modal?.close();
      for (const position of positions)
        if (position.element.isConnected)
          position.element.scrollTo({
            top: position.top,
            left: position.left,
            behavior: "instant",
          });
      window.scrollTo({
        left: initialScroll.x,
        top: initialScroll.y,
        behavior: "instant",
      });
    };
  }, [steps]);
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    const measure = () => {
      const el = step.element;
      const style = getComputedStyle(document.documentElement),
        gap = parseFloat(style.getPropertyValue("--tour-gap")),
        pad = parseFloat(style.getPropertyValue("--tour-target-pad"));
      const vw = window.innerWidth,
        vh = window.innerHeight,
        r = el.getBoundingClientRect();
      const left = Math.max(0, r.left - pad),
        top = Math.max(0, r.top - pad),
        right = Math.min(vw, r.right + pad),
        bottom = Math.min(vh, r.bottom + pad);
      const ph = panel.current?.offsetHeight ?? 0,
        pw = panel.current?.offsetWidth ?? 0;
      const panelTop =
        vh - bottom >= ph + gap
          ? bottom + gap
          : top >= ph + gap
            ? top - ph - gap
            : Math.max(gap, vh - ph - gap);
      const next = {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
        vw,
        vh,
        panelTop,
        panelLeft: Math.max(gap, Math.min(left, vw - pw - gap)),
      };
      setBox((old) =>
        old &&
        Object.keys(next).every(
          (k) => next[k as keyof Box] === old[k as keyof Box],
        )
          ? old
          : next,
      );
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    step.element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
    measure();
    update();
    const observer = new ResizeObserver(update);
    observer.observe(step.element);
    const work = document.querySelector("main");
    if (work) observer.observe(work);
    observer.observe(document.body);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);
  function move(direction: number) {
    let next = index + direction;
    while (
      next >= 0 &&
      next < steps.length &&
      !steps[next]!.element.isConnected
    )
      next += direction;
    if (next < 0) return;
    if (next >= steps.length) {
      onClose();
      return;
    }
    setIndex(next);
  }
  const finish = index === steps.length - 1;
  return (
    <dialog
      ref={dialog}
      className="tour-modal fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-ink"
      aria-label={t("tour.open")}
      aria-describedby={`${id}-body`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-tour-ui
    >
      {box ? (
        <>
          <div
            data-tour-backdrop
            className="pointer-events-auto fixed bg-ink/10 backdrop-blur-(--tour-blur)"
            style={{ left: 0, top: 0, width: box.vw, height: box.top }}
          />
          <div
            data-tour-backdrop
            className="pointer-events-auto fixed bg-ink/10 backdrop-blur-(--tour-blur)"
            style={{
              left: 0,
              top: box.top,
              width: box.left,
              height: box.height,
            }}
          />
          <div
            data-tour-backdrop
            className="pointer-events-auto fixed bg-ink/10 backdrop-blur-(--tour-blur)"
            style={{
              left: box.left + box.width,
              top: box.top,
              width: Math.max(0, box.vw - box.left - box.width),
              height: box.height,
            }}
          />
          <div
            data-tour-backdrop
            className="pointer-events-auto fixed bg-ink/10 backdrop-blur-(--tour-blur)"
            style={{
              left: 0,
              top: box.top + box.height,
              width: box.vw,
              height: Math.max(0, box.vh - box.top - box.height),
            }}
          />
          <div
            data-tour-spotlight
            aria-hidden
            className="pointer-events-none fixed rounded-control border-2 border-brand shadow-focus"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
          />
        </>
      ) : null}
      <div
        ref={panel}
        className="fixed flex max-h-(--tour-panel-height) w-(--tour-panel-width) max-w-[calc(100vw-var(--tour-gap)*2)] flex-col gap-3 overflow-hidden rounded-card border border-line bg-canvas p-4 shadow-sheet"
        style={
          box
            ? { left: box.panelLeft, top: box.panelTop }
            : { right: "var(--tour-gap)", bottom: "var(--tour-gap)" }
        }
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="text-caption font-semibold text-ink-muted">
            {t("tour.step", { current: index + 1, total: steps.length })}
          </p>
          <Button variant="quiet" size="md" onClick={onClose}>
            {t("tour.exit")}
          </Button>
        </div>
        <div
          className="flex min-h-0 flex-col gap-3 overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-labelledby={`${id}-step-title`}
        >
          <div
            data-tour-step
            aria-live="polite"
            aria-atomic="true"
            className="flex flex-col gap-2"
          >
            <h2
              id={`${id}-step-title`}
              className="text-title-sm font-bold text-ink"
            >
              {step?.label ?? t("tour.screen")}
            </h2>
            <p id={`${id}-body`} className="text-body text-ink">
              {step?.kind === "overview"
                ? intro
                : t(`tour.kind.${step?.kind ?? "overview"}`, {
                    label: step?.label ?? "",
                  })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-between gap-2">
          <Button
            variant="secondary"
            size="md"
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            {t("tour.previous")}
          </Button>
          <Button size="md" onClick={() => (finish ? onClose() : move(1))}>
            {t(finish ? "tour.finish" : "tour.next")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
