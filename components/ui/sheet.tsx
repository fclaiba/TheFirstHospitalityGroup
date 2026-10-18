"use client";

import { useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Drawer } from "vaul";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n-client";
import { GuideLauncher } from "@/components/guide/interactive-guide";

/**
 * Bottom sheet (BLUEPRINT 4.2): vaul's spring and velocity handoff, drag to dismiss, dimming scrim for a modal task,
 * safe-area padding, contained scroll (apple-design 3, 5, 12; mobile-native 6, 7).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const scopeId = useId();
  const path = usePathname();
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-scrim/40" />
        <Drawer.Content
          id={scopeId}
          onEscapeKeyDown={(event) => {
            const guide = document
              .getElementById(scopeId)
              ?.querySelector<HTMLDialogElement>("dialog[open]");
            if (!guide) return;
            // Escape dismisses the innermost task, preserving the enclosing sheet and its selections.
            event.preventDefault();
            guide.dispatchEvent(new Event("cancel", { cancelable: true }));
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-sheet bg-surface-raised shadow-sheet outline-none md:bottom-6 md:rounded-sheet",
            className,
          )}
        >
          <div
            className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-pill bg-line"
            aria-hidden
          />
          <div data-tour-ui className="flex shrink-0 justify-end px-5">
            <GuideLauncher
              key={title}
              path={path}
              scopeId={scopeId}
              task={{ title, description }}
            />
          </div>
          <header className="flex items-start justify-between gap-4 px-5 pt-3 pb-2">
            <div className="min-w-0">
              <Drawer.Title className="text-title-sm font-bold text-ink">
                {title}
              </Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-1 text-small text-ink-muted">
                  {description}
                </Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">
                  {title}
                </Drawer.Description>
              )}
            </div>
            <Drawer.Close
              data-tour-ui
              aria-label={t("common.close")}
              className="pressable hover-surface -mt-1 -mr-2 flex size-target shrink-0 items-center justify-center rounded-full text-ink-muted"
            >
              <X weight="bold" className="size-5" />
            </Drawer.Close>
          </header>
          <div className="scroll-contain min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            {children}
          </div>
          {footer ? (
            <div className="border-t border-line px-5 pt-4 pb-[calc(1rem+var(--safe-bottom))]">
              {footer}
            </div>
          ) : (
            <div className="pb-(--safe-bottom)" />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
