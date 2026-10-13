"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useVenue } from "@/hooks/use-app";
import { useT } from "@/lib/i18n-client";
import { Field, Select } from "@/components/ui/field";

/**
 * The venue a company screen looks at. Starts on the header's current venue; changing it here does not change the
 * venue of the rest of the app (corporate reads one venue at a time on these screens).
 */
export function useCompanyVenue(): { venueId: Id<"venues"> | null; setVenueId: (id: Id<"venues">) => void; venues: Array<{ id: string; name: string }> } {
  const { venueId: current, venues } = useVenue();
  const [picked, setPicked] = useState<Id<"venues"> | null>(null);
  const valid = picked && venues.some((v) => v.id === picked) ? picked : null;
  return { venueId: valid ?? current, setVenueId: setPicked, venues };
}

export function VenuePicker({ value, onChange, venues, label }: { value: string | null; onChange: (id: Id<"venues">) => void; venues: Array<{ id: string; name: string }>; label?: string }) {
  const t = useT();
  if (venues.length < 2) return null;
  return (
    <Field label={label ?? t("common.venue")} className="max-w-sm">
      {(p) => (
        <Select {...p} value={value ?? ""} onChange={(e) => onChange(e.target.value as Id<"venues">)}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
