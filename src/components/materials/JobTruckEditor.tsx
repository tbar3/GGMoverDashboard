"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reassignJobTruck } from "@/lib/materials/actions";

type Truck = { id: number; name: string };

export default function JobTruckEditor({
  jobId,
  currentTruckId,
  trucks,
  isComplete,
}: {
  jobId: number;
  currentTruckId: number;
  trucks: Truck[];
  isComplete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<number>(currentTruckId);
  const [msg, setMsg] = useState<string | null>(null);

  const move = () =>
    startTransition(async () => {
      setMsg(null);
      if (target === currentTruckId) {
        setMsg("Pick a different truck.");
        return;
      }
      const r = await reassignJobTruck(jobId, target);
      if (!r.ok) {
        setMsg(r.message ?? "Could not move the job.");
        return;
      }
      setOpen(false);
      router.refresh();
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-ui text-sm font-semibold text-navy-500 underline decoration-dotted underline-offset-2 hover:text-navy-700"
      >
        Wrong truck? Change it
      </button>
    );
  }

  return (
    <div className="gg-surface mt-2 max-w-md p-3">
      <p className="mb-2 font-ui text-sm font-semibold text-navy-700">
        Move this job to a different truck
      </p>
      <p className="mb-3 font-ui text-xs text-navy-500">
        The counts stay with the job — only the truck changes.
        {isComplete
          ? " Because this sheet is complete, its inventory effect moves from the old truck to the new one."
          : ""}{" "}
        Double-check Pre-Dispatch afterward if the two trucks held different
        stock.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="gg-input py-1.5"
          value={target}
          disabled={pending}
          onChange={(e) => setTarget(Number(e.target.value))}
        >
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.id === currentTruckId ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={move}
          disabled={pending || target === currentTruckId}
          className="gg-btn-primary px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Moving…" : "Move job"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMsg(null);
            setTarget(currentTruckId);
          }}
          disabled={pending}
          className="gg-btn-ghost px-3 py-2"
        >
          Cancel
        </button>
      </div>
      {msg && (
        <p className="mt-2 font-ui text-sm font-semibold text-red-500">{msg}</p>
      )}
    </div>
  );
}
