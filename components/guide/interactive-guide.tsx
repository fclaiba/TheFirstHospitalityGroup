"use client";
import { useRef, useState } from "react";
import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { Compass } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import type { WalkthroughProps } from "./walkthrough";

/** One consistent entry on every route; the walkthrough itself is downloaded only when requested. */
export function InteractiveGuide() {
  const path = usePathname();
  return <Launcher key={path} path={path} />;
}
function Launcher({ path }: { path: string }) {
  const t = useT();
  const button = useRef<HTMLButtonElement>(null);
  const [Panel, setPanel] = useState<ComponentType<WalkthroughProps> | null>(
      null,
    ),
    [loading, setLoading] = useState(false),
    [open, setOpen] = useState(false);
  async function launch() {
    setLoading(true);
    try {
      const guideModule = await import("./walkthrough");
      setPanel(() => guideModule.Walkthrough);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div
        data-tour-ui
        className="fixed inset-x-0 top-0 z-50 h-(--guide-bar-height) border-b border-line bg-canvas pt-(--safe-top) no-print"
      >
        <div className="mx-auto flex w-full max-w-3xl justify-end px-4">
          <Button
            ref={button}
            variant="quiet"
            size="md"
            loading={loading}
            icon={<Compass className="size-5" aria-hidden />}
            onClick={launch}
          >
            {t("tour.open")}
          </Button>
        </div>
      </div>
      {open && Panel ? (
        <Panel
          path={path}
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
