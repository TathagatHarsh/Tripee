"use client";

import { useActionState } from "react";
import {
  addZone, deleteZone, saveDeliverySlot, saveMinOrder, saveZone,
  type ActionResult,
} from "../actions";
import { aBtn, aField, aMonoField } from "@/components/admin/ui";

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export interface SlotRowData {
  id: string;
  value: string;
  name: string;
  priceInputPaise: number;
  leadHours: number;
  dailyCapacity: number | null;
  cutoffHours: number | null;
  slotWindow: string;
  slotNote: string;
  isAvailable: boolean;
}

export interface ZoneRowData {
  id: string;
  name: string;
  pincodeFrom: number;
  pincodeTo: number;
  extraHours: number;
  slots: string[];
  isActive: boolean;
}

function Status({ result }: { result: ActionResult | undefined }) {
  if (!result) return null;
  return (
    <p role="status" className={`font-a-mono text-a-meta ${result.ok ? "text-a-accent-ink" : "text-a-bad-ink"}`}>
      {result.message}
    </p>
  );
}

/**
 * One delivery slot: what it costs, how long it takes, and what it promises.
 *
 * The window and the note are wide text inputs rather than time pickers,
 * because the true answer is a sentence — "order by 18:00 the previous day" is
 * a cutoff and its consequence at once, and a pair of time fields would keep
 * the half that is easy to store and lose the half worth reading.
 */
export function SlotRow({ slot, offeredIn }: { slot: SlotRowData; offeredIn: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveDeliverySlot,
    undefined,
  );

  return (
    <li className={`border-b border-a-line last:border-0 ${slot.isAvailable ? "" : "bg-a-sunken"}`}>
      <form action={formAction} className="flex flex-col gap-3 px-4 py-4">
        <input type="hidden" name="id" value={slot.id} />

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-a-mono text-a-item font-medium">{slot.name}</h3>
          <span className="font-a-mono text-a-meta text-a-faint">{slot.value}</span>
        </div>

        {!slot.isAvailable && (
          <p className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-bad-ink">
            Withdrawn on the catalogue page — customers cannot choose this slot.
          </p>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <label className="flex items-baseline gap-2">
            <span className="font-a-mono text-a-small text-a-muted">Fee</span>
            <span className="font-a-mono text-a-body text-a-muted" aria-hidden="true">₹</span>
            <input
              name="fee"
              defaultValue={rupees(slot.priceInputPaise)}
              inputMode="decimal"
              className={aMonoField("w-24 text-right")}
            />
          </label>

          <label className="flex items-baseline gap-2">
            <span className="font-a-mono text-a-small text-a-muted">Lead time</span>
            <input
              name="leadHours"
              defaultValue={String(slot.leadHours)}
              inputMode="numeric"
              className={aMonoField("w-20 text-right")}
            />
            <span className="font-a-mono text-a-small text-a-muted">hours</span>
          </label>

          <label className="flex items-baseline gap-2">
            <span className="font-a-mono text-a-small text-a-muted">Daily capacity</span>
            <input
              name="dailyCapacity"
              defaultValue={slot.dailyCapacity ?? ""}
              inputMode="numeric"
              className={aMonoField("w-20 text-right")}
              aria-label="Daily cake capacity"
            />
            <span className="font-a-mono text-a-small text-a-muted">cakes</span>
          </label>

          <label className="flex items-baseline gap-2">
            <span className="font-a-mono text-a-small text-a-muted">Cutoff</span>
            <input
              name="cutoffHours"
              defaultValue={slot.cutoffHours ?? ""}
              inputMode="numeric"
              className={aMonoField("w-20 text-right")}
              aria-label="Cutoff hours"
            />
            <span className="font-a-mono text-a-small text-a-muted">hours before</span>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
            When it arrives
          </span>
          <input
            name="slotWindow"
            defaultValue={slot.slotWindow}
            maxLength={120}
            className={aField("w-full")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
            The catch, and the cutoff
          </span>
          <input
            name="slotNote"
            defaultValue={slot.slotNote}
            maxLength={200}
            className={aField("w-full")}
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} className={aBtn("secondary", "md")}>
            {pending ? "Saving" : "Save slot"}
          </button>
          <Status result={result} />
          <p className="font-a-sans text-a-meta text-a-muted">
            Offered in: {offeredIn || "no zone — nobody can pick this"}
          </p>
        </div>
      </form>
    </li>
  );
}

function SlotChecks({ options, checked }: { options: SlotRowData[]; checked: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
        Slots this zone can take
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 font-a-mono text-a-small">
            <input
              type="checkbox"
              name="slots"
              value={o.value}
              defaultChecked={checked.includes(o.value)}
              className="size-4 accent-ink"
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ZoneFields({ zone }: { zone?: ZoneRowData }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1">
        <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">Name</span>
        <input name="name" defaultValue={zone?.name ?? ""} maxLength={60} className={aField("w-56")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
          Pincodes from
        </span>
        <input
          name="pincodeFrom"
          defaultValue={zone ? String(zone.pincodeFrom) : ""}
          inputMode="numeric"
          placeholder="500001"
          className={aMonoField("w-28")}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">to</span>
        <input
          name="pincodeTo"
          defaultValue={zone ? String(zone.pincodeTo) : ""}
          inputMode="numeric"
          placeholder="500099"
          className={aMonoField("w-28")}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
          Extra rider time
        </span>
        <span className="flex items-baseline gap-2">
          <input
            name="extraHours"
            defaultValue={zone ? String(zone.extraHours) : "0"}
            inputMode="numeric"
            className={aMonoField("w-20 text-right")}
          />
          <span className="font-a-mono text-a-small text-a-muted">hours</span>
        </span>
      </label>
    </div>
  );
}

export function ZoneRow({ zone, slots }: { zone: ZoneRowData; slots: SlotRowData[] }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveZone,
    undefined,
  );

  return (
    <li className={`border-b border-a-line last:border-0 ${zone.isActive ? "" : "bg-a-sunken"}`}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={zone.id} />
          <ZoneFields zone={zone} />
          <SlotChecks options={slots} checked={zone.slots} />

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-a-mono text-a-small">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={zone.isActive}
                className="size-4 accent-ink"
              />
              Delivering here
            </label>
            <button type="submit" disabled={pending} className={aBtn("secondary", "md")}>
              {pending ? "Saving" : "Save zone"}
            </button>
            <Status result={result} />
          </div>
        </form>

        <form action={deleteZone}>
          <input type="hidden" name="id" value={zone.id} />
          <button
            type="submit"
            className="font-a-mono text-a-meta text-a-muted underline-offset-4 hover:text-a-bad-ink hover:underline"
          >
            Delete this zone
          </button>
        </form>
      </div>
    </li>
  );
}

export function AddZone({ slots }: { slots: SlotRowData[] }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    addZone,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-a border border-a-line bg-a-surface px-4 py-4">
      <ZoneFields />
      <SlotChecks options={slots} checked={["standard", "pickup"]} />
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={aBtn("primary", "md")}>
          {pending ? "Adding" : "Add zone"}
        </button>
        <Status result={result} />
      </div>
    </form>
  );
}

export function MinOrderForm({ minOrderPaise }: { minOrderPaise: number }) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    saveMinOrder,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-4 rounded-a border border-a-line bg-a-surface px-4 py-4"
    >
      <label className="flex items-baseline gap-2">
        <span className="font-a-mono text-a-small text-a-muted">Smallest order we take</span>
        <span className="font-a-mono text-a-body text-a-muted" aria-hidden="true">₹</span>
        <input
          name="minOrder"
          defaultValue={rupees(minOrderPaise)}
          inputMode="decimal"
          className={aMonoField("w-24 text-right")}
        />
      </label>
      <button type="submit" disabled={pending} className={aBtn("secondary", "md")}>
        {pending ? "Saving" : "Save"}
      </button>
      <Status result={result} />
      <p className="w-full font-a-sans text-a-meta leading-relaxed text-a-muted">
        Before GST. Zero means no minimum, which is what this shipped with.
      </p>
    </form>
  );
}
