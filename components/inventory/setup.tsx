"use client";

import { useState } from "react";
import { ArrowsLeftRight, PencilSimple, Plus, ShoppingCart, Wine } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "@/lib/backend/hooks";
import { useRun } from "@/lib/backend/run";
import { useLocale } from "@/lib/i18n-client";
import { ago, money, parseCents, tenths } from "@/lib/format";
import { useMe, useVenue } from "@/hooks/use-app";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, SwitchRow, Textarea } from "@/components/ui/field";
import { List, PageHeader, Row, Section } from "@/components/ui/layout";
import { PhotoField, StoredPhoto } from "@/components/ui/photo-field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ScreenSkeleton } from "@/components/ui/states";
import { StatusChip } from "@/components/ui/status";

type Item = {
  _id: string;
  name: string;
  category: string;
  unit: "bottle" | "unit";
  parLevel: number | null;
  avgCostCents: number | null;
  active: boolean;
  photoId: string | null;
  onHandTenths: number;
  belowPar: boolean;
};

/** Bottles with at most one decimal → integer tenths; null when invalid. Signed only when allowed. */
export function parseTenths(raw: string, signed = false): number | null {
  const s = raw.trim().replace(",", ".");
  if (!(signed ? /^-?\d+(\.\d)?$/ : /^\d+(\.\d)?$/).test(s)) return null;
  return Math.round(Number(s) * 10);
}

const centsText = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

/** Manager and owner setup of a venue's bar items, purchases, losses and transfers (BLUEPRINT 2.2, project rule 7). */
export function InventorySetup() {
  const { t, locale } = useLocale();
  const { venueId, venueName } = useVenue();
  const list = useQuery(api.inventory.items, venueId ? { venueId, includeInactive: true } : "skip");
  const history = useQuery(api.inventory.history, venueId ? { venueId, limit: 30 } : "skip");
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const [purchase, setPurchase] = useState(false);
  const [move, setMove] = useState(false);

  if (!venueId || list === undefined) return <ScreenSkeleton rows={6} />;
  const items = list as Item[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("inventory.setup.title")} eyebrow={venueName} subtitle={t("inventory.setup.subtitle")} back="/manage/setup" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button icon={<ShoppingCart weight="bold" className="size-5" />} onClick={() => setPurchase(true)} disabled={!items.length}>
          {t("inventory.setup.purchase")}
        </Button>
        <Button variant="secondary" icon={<ArrowsLeftRight weight="bold" className="size-5" />} onClick={() => setMove(true)} disabled={!items.length}>
          {t("inventory.setup.move")}
        </Button>
        <Button variant="secondary" icon={<Plus weight="bold" className="size-5" />} onClick={() => setEdit("new")}>
          {t("inventory.setup.addItem")}
        </Button>
      </div>

      <Section title={t("inventory.setup.items")}>
        {items.length === 0 ? (
          <EmptyState icon={<Wine weight="bold" />} title={t("inventory.emptyTitle")} />
        ) : (
          <List>
            {items.map((it) => (
              <Row
                key={it._id}
                leading={it.photoId ? <StoredPhoto storageId={it.photoId} alt="" className="size-10 rounded-input" /> : <Wine weight="bold" className="size-6" />}
                title={it.name}
                subtitle={[it.category, t("inventory.setup.onHand", { qty: tenths(it.onHandTenths) }), it.avgCostCents !== null ? t("inventory.setup.avg", { money: money(locale, it.avgCostCents) }) : null]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <>
                    {!it.active ? (
                      <StatusChip tone="neutral" size="sm">
                        {t("inventory.setup.inactive")}
                      </StatusChip>
                    ) : it.belowPar ? (
                      <StatusChip tone="attention" size="sm">
                        {t("inventory.belowPar")}
                      </StatusChip>
                    ) : null}
                    <IconButton label={`${t("inventory.setup.editItem")}: ${it.name}`} onClick={() => setEdit(it)}>
                      <PencilSimple weight="bold" className="size-5" />
                    </IconButton>
                  </>
                }
              />
            ))}
          </List>
        )}
      </Section>

      <Section title={t("inventory.setup.history")}>
        {history === undefined ? null : history.length === 0 ? (
          <p className="rounded-card bg-surface px-4 py-6 text-center text-body text-ink-muted">{t("inventory.setup.historyEmpty")}</p>
        ) : (
          <List>
            {history.map((m) => (
              <Row
                key={m._id}
                title={`${m.itemName} · ${t(`inventory.setup.type.${m.type}`)}`}
                subtitle={[m.note, m.byName, ago(t, m.at)].filter(Boolean).join(" · ")}
                trailing={<span className={m.qtyTenths < 0 ? "font-mono font-semibold text-review-fg tabular" : "font-mono font-semibold text-ok-fg tabular"}>{`${m.qtyTenths > 0 ? "+" : ""}${tenths(m.qtyTenths)}`}</span>}
              />
            ))}
          </List>
        )}
      </Section>

      {edit ? <ItemSheet venueId={venueId} item={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      <PurchaseSheet open={purchase} onClose={() => setPurchase(false)} venueId={venueId} items={items.filter((i) => i.active)} />
      <MoveSheet open={move} onClose={() => setMove(false)} venueId={venueId} items={items.filter((i) => i.active)} />
    </div>
  );
}

function ItemSheet({ venueId, item, onClose }: { venueId: Id<"venues">; item: Item | null; onClose: () => void }) {
  const { t } = useLocale();
  const save = useRun(api.inventory.upsertItem, { success: t("inventory.setup.saved"), silent: true });
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState<"bottle" | "unit">(item?.unit ?? "bottle");
  const [par, setPar] = useState(item?.parLevel != null ? tenths(item.parLevel) : "");
  const [cost, setCost] = useState(centsText(item?.avgCostCents));
  const [active, setActive] = useState(item?.active ?? true);
  const [photoId, setPhotoId] = useState<string | null>(item?.photoId ?? null);
  const [local, setLocal] = useState<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    const parTenths = par.trim() ? parseTenths(par) : undefined;
    if (parTenths === null) errs.parLevel = t("inventory.setup.invalidQty");
    const avg = parseCents(cost || "0");
    if (avg === null) errs.avgCostCents = t("inventory.setup.invalidMoney");
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const r = await save.run({
      itemId: item?._id as Id<"inventoryItems"> | undefined,
      venueId,
      name,
      category,
      unit,
      parLevel: parTenths ?? undefined,
      avgCostCents: avg!,
      photoId: photoId ?? undefined,
      active,
    });
    if (r) onClose();
  };
  const err = (k: string) => local[k] ?? (save.fields[k] ? t("errors.INVALID_INPUT") : undefined);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? t("inventory.setup.editItem") : t("inventory.setup.addItem")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("common.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label={t("inventory.setup.name")} error={err("name")}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
        </Field>
        <Field label={t("inventory.setup.category")} help={t("inventory.setup.categoryHelp")} error={err("category")}>
          {(p) => <Input {...p} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={30} />}
        </Field>
        <Field label={t("inventory.setup.unitLabel")}>
          {(p) => (
            <Select {...p} value={unit} onChange={(e) => setUnit(e.target.value as "bottle" | "unit")}>
              <option value="bottle">{t("inventory.setup.unitBottle")}</option>
              <option value="unit">{t("inventory.setup.unitUnit")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("inventory.setup.parLevel")} help={t("inventory.setup.parHelp")} error={err("parLevel")} optional={t("common.optional")}>
          {(p) => <Input {...p} inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} />}
        </Field>
        <Field label={t("inventory.setup.avgCost")} error={err("avgCostCents")}>
          {(p) => <Input {...p} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />}
        </Field>
        <SwitchRow label={t("inventory.setup.active")} help={t("inventory.setup.activeHelp")} checked={active} onChange={setActive} />
        <PhotoField value={photoId} onChange={setPhotoId} purpose="inventory" />
        {save.error && !Object.keys(save.fields).length ? <p className="text-small font-medium text-danger">{save.message}</p> : null}
      </div>
    </Sheet>
  );
}

function ItemSelect({ items, value, onChange, label }: { items: Item[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Field label={label}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          {items.map((i) => (
            <option key={i._id} value={i._id}>
              {i.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function PurchaseSheet({ open, onClose, venueId, items }: { open: boolean; onClose: () => void; venueId: Id<"venues">; items: Item[] }) {
  const { t } = useLocale();
  const save = useRun(api.inventory.recordPurchase, { success: t("inventory.setup.purchaseDone") });
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const chosen = itemId || items[0]?._id || "";

  const submit = async () => {
    const q = parseTenths(qty);
    const c = parseCents(cost);
    const e: Record<string, string> = {};
    if (!q) e.qty = t("inventory.setup.invalidQty");
    if (c === null) e.cost = t("inventory.setup.invalidMoney");
    setErrs(e);
    if (Object.keys(e).length) return;
    const r = await save.run({ venueId, itemId: chosen, qtyTenths: q!, unitCostCents: c!, note: note || undefined });
    if (r) {
      setQty("");
      setCost("");
      setNote("");
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("inventory.setup.purchase")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("common.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <ItemSelect items={items} value={chosen} onChange={setItemId} label={t("inventory.setup.item")} />
        <Field label={t("inventory.setup.qty")} help={t("inventory.setup.qtyHelp")} error={errs.qty}>
          {(p) => <Input {...p} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}
        </Field>
        <Field label={t("inventory.setup.unitCost")} error={errs.cost}>
          {(p) => <Input {...p} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />}
        </Field>
        <Field label={t("inventory.setup.note")} optional={t("common.optional")}>
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
        </Field>
      </div>
    </Sheet>
  );
}

const MOVE_TYPES = ["waste", "comp", "transfer_out", "adjustment"] as const;

function MoveSheet({ open, onClose, venueId, items }: { open: boolean; onClose: () => void; venueId: Id<"venues">; items: Item[] }) {
  const { t } = useLocale();
  const me = useMe();
  const save = useRun(api.inventory.recordMove, { success: t("inventory.setup.moveDone") });
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState<(typeof MOVE_TYPES)[number]>("waste");
  const [qty, setQty] = useState("");
  const [toVenueId, setToVenueId] = useState("");
  const [note, setNote] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const chosen = itemId || items[0]?._id || "";
  const others = (me?.venues ?? []).filter((v) => v.id !== venueId);
  const dest = toVenueId || others[0]?.id || "";

  const submit = async () => {
    const q = parseTenths(qty, type === "adjustment");
    const e: Record<string, string> = {};
    if (!q) e.qty = t("inventory.setup.invalidQty");
    if (!note.trim()) e.note = t("inventory.setup.reasonHelp");
    setErrs(e);
    if (Object.keys(e).length) return;
    const r = await save.run({ venueId, itemId: chosen, type, qtyTenths: q!, note, toVenueId: type === "transfer_out" ? dest : undefined });
    if (r) {
      setQty("");
      setNote("");
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("inventory.setup.move")}
      footer={
        <Button block loading={save.busy} onClick={() => void submit()}>
          {t("common.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <ItemSelect items={items} value={chosen} onChange={setItemId} label={t("inventory.setup.item")} />
        <Field label={t("inventory.setup.moveType")}>
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as (typeof MOVE_TYPES)[number])}>
              {MOVE_TYPES.filter((m) => m !== "transfer_out" || others.length).map((m) => (
                <option key={m} value={m}>
                  {t(`inventory.setup.type.${m}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {type === "transfer_out" ? (
          <Field label={t("inventory.setup.toVenue")}>
            {(p) => (
              <Select {...p} value={dest} onChange={(e) => setToVenueId(e.target.value)}>
                {others.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t("inventory.setup.qty")} help={type === "adjustment" ? t("inventory.setup.adjustmentHelp") : t("inventory.setup.qtyHelp")} error={errs.qty}>
          {(p) => <Input {...p} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}
        </Field>
        <Field label={t("inventory.setup.reason")} help={t("inventory.setup.reasonHelp")} error={errs.note}>
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
        </Field>
      </div>
    </Sheet>
  );
}
