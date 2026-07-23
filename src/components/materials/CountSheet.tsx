"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dispatchJob,
  saveJobDraft,
  completeJob,
  createJob,
  type CountInput,
  type JobHeaderInput,
} from "@/lib/materials/actions";

type CountRow = {
  material_id: number;
  name: string;
  par: number;
  pre_dispatch: number | null;
  post_dispatch: number | null;
  post_job: number | null;
};

type RoutineItem = { id: number; label: string };
type EquipRow = {
  equipment_id: number;
  name: string;
  par: number;
  is_storage_pad: boolean;
  dispatch_count: number | null;
  after_count: number | null;
};

type Props = {
  jobId: number;
  truckId: number;
  truckName: string;
  jobDate: string;
  sequenceNo: number;
  status: "draft" | "dispatched" | "complete";
  isAdmin: boolean;
  isFirstOfDay: boolean;
  morningItems: RoutineItem[];
  closeItems: RoutineItem[];
  crew: string[];
  initialHeader: JobHeaderInput;
  initialCounts: CountRow[];
  initialEquipment: EquipRow[];
  area?: "admin" | "crew";
};

// Material counts allow half units (e.g. 2.5 rolls of tape). Round to 2
// decimals to keep the value clean and avoid float noise.
function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Equipment (hand trucks, runners) and storage pads are whole units.
function numInt(v: string): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

export default function CountSheet({
  jobId,
  truckId,
  truckName,
  jobDate,
  sequenceNo,
  status,
  isAdmin,
  isFirstOfDay,
  morningItems,
  closeItems,
  crew,
  initialHeader,
  initialCounts,
  initialEquipment,
  area = "crew",
}: Props) {
  const router = useRouter();
  const homeHref = area === "crew" ? "/materials" : "/admin/materials";
  const homeLabel = area === "crew" ? "Back to Jobs" : "Back to Inventory";
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // Validation: list of what's missing + whether a submit was attempted
  // (drives the red field outlines + the error checklist by the buttons).
  const [errors, setErrors] = useState<string[]>([]);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const isCompleted = status === "complete";
  // A completed job is locked for everyone by default. Admins must explicitly
  // click "Edit job" to make changes (so it locks right after Complete).
  const [editing, setEditing] = useState(false);
  const adminEditing = isCompleted && isAdmin && editing;
  const locked = isCompleted && !(isAdmin && editing);

  // Two-step workflow: dispatch (draft) -> after-job (dispatched) -> done (complete)
  const phase: "dispatch" | "afterjob" | "done" = isCompleted
    ? "done"
    : status === "dispatched"
    ? "afterjob"
    : "dispatch";
  // Show the After-Job column + Used once past dispatch (or when an admin edits)
  const showAfterJob = phase !== "dispatch";

  const [header, setHeader] = useState<JobHeaderInput>(initialHeader);
  const [counts, setCounts] = useState<CountRow[]>(initialCounts);

  // Equipment checklist (reusable gear — dispatch count in Step 1, after count in Step 2)
  const [equip, setEquip] = useState<
    Record<number, { dispatch: string; after: string; checked: boolean }>
  >(() =>
    Object.fromEntries(
      initialEquipment.map((e) => [
        e.equipment_id,
        {
          dispatch: e.dispatch_count?.toString() ?? "",
          after: e.after_count?.toString() ?? "",
          checked: false,
        },
      ])
    )
  );
  const setEq = (
    id: number,
    field: "dispatch" | "after" | "checked",
    v: string | boolean
  ) => setEquip((prev) => ({ ...prev, [id]: { ...prev[id], [field]: v } }));
  const toEquip = (field: "dispatch" | "after") =>
    initialEquipment.map((e) => ({
      equipment_id: e.equipment_id,
      count: numInt(equip[e.equipment_id]?.[field] ?? ""),
    }));

  const setCount = (
    id: number,
    field: "pre_dispatch" | "post_dispatch" | "post_job",
    value: string
  ) =>
    setCounts((prev) =>
      prev.map((c) =>
        c.material_id === id ? { ...c, [field]: num(value) } : c
      )
    );

  const toInputs = (): CountInput[] =>
    counts.map((c) => ({
      material_id: c.material_id,
      pre_dispatch: c.pre_dispatch,
      post_dispatch: isFirstOfDay ? c.post_dispatch : c.pre_dispatch,
      post_job: c.post_job,
    }));

  const usedOf = (c: CountRow): number | null => {
    if (c.post_job === null) return null;
    if (isFirstOfDay)
      return c.post_dispatch === null ? null : c.post_dispatch - c.post_job;
    return c.pre_dispatch === null ? null : c.pre_dispatch - c.post_job;
  };

  const toBeAdded = (c: CountRow): number | null =>
    isFirstOfDay && c.pre_dispatch !== null ? c.par - c.pre_dispatch : null;

  // Computed inline (not useMemo): usedOf is redefined each render, so the
  // manual memo can't be preserved under the React Compiler, and the reduce is
  // cheap. The compiler memoizes this for us.
  const totalUsed = counts.reduce((s, c) => s + (usedOf(c) ?? 0), 0);

  const headerMissing = (): string[] => {
    const need: string[] = [];
    if (!header.customer?.trim()) need.push("Customer");
    if (!header.job_number?.trim()) need.push("Job #");
    if (!header.crew_lead?.trim()) need.push("Crew Lead");
    if (!header.crew?.trim()) need.push("Crew");
    return need;
  };

  const run = (
    fn: () => Promise<void>,
    okMsg?: string | null,
    onOk?: () => void
  ) =>
    startTransition(async () => {
      try {
        await fn();
        if (okMsg !== undefined) setMessage(okMsg);
        setErrors([]);
        setTriedSubmit(false);
        onOk?.();
        router.refresh();
      } catch {
        setMessage("Something went wrong saving — please try again.");
      }
    });

  // Show a clear popup + a persistent red checklist of everything missing.
  const failValidation = (problems: string[]) => {
    setTriedSubmit(true);
    setErrors(problems);
    setMessage(null);
    window.alert(
      "Can't submit yet — please complete:\n\n• " + problems.join("\n• ")
    );
  };

  // Collect EVERYTHING missing for Step 1 (dispatch), in one pass.
  const dispatchProblems = (): string[] => {
    const p = [...headerMissing()];
    const countsMissing = counts.some((c) =>
      isFirstOfDay
        ? c.pre_dispatch === null || c.post_dispatch === null
        : c.pre_dispatch === null
    );
    if (countsMissing)
      p.push(
        isFirstOfDay
          ? "Pre-Dispatch & Post-Dispatch for every material"
          : "Pre-Dispatch for every material"
      );
    const eqMissing = initialEquipment.some(
      (e) => numInt(equip[e.equipment_id]?.dispatch ?? "") === null
    );
    if (eqMissing) p.push("A truck count for every equipment item");
    return p;
  };

  // Collect EVERYTHING missing for Step 2 (complete), in one pass.
  const completeProblems = (): string[] => {
    const p = [...headerMissing()];
    const countsMissing = counts.some((c) => {
      if (c.post_job === null) return true;
      if (isFirstOfDay)
        return c.pre_dispatch === null || c.post_dispatch === null;
      return c.pre_dispatch === null;
    });
    if (countsMissing) p.push("After-Job count for every material");
    if (
      header.is_storage_in &&
      (header.storage_pads_used === null ||
        header.storage_pads_used === undefined)
    )
      p.push("Pads left in storage (Furniture Pads)");
    const eqMissing = initialEquipment.some(
      (e) => numInt(equip[e.equipment_id]?.after ?? "") === null
    );
    if (eqMissing) p.push("A current count for every equipment item");
    if (!header.entered_in_smartmoving)
      p.push("Check “Entered in SmartMoving”");
    return p;
  };

  // Step 1: Finished Dispatch
  const handleDispatch = () => {
    const problems = dispatchProblems();
    if (problems.length) {
      failValidation(problems);
      return;
    }
    setMessage(null);
    setErrors([]);
    run(() => dispatchJob(jobId, header, toInputs(), toEquip("dispatch")), null);
  };

  // Step 2 helper save (no completion)
  const handleSaveProgress = () => {
    setMessage(null);
    setErrors([]);
    run(
      () => saveJobDraft(jobId, header, toInputs(), toEquip("after")),
      "Progress saved."
    );
  };

  // Step 2: Complete (final count) — commits inventory
  const handleComplete = () => {
    const problems = completeProblems();
    if (problems.length) {
      failValidation(problems);
      return;
    }
    // Shortage: any equipment with fewer now than at dispatch. For Furniture
    // Pads on a Storage-In job, pads left in storage count as accounted-for.
    const short = initialEquipment.filter((e) => {
      const after = numInt(equip[e.equipment_id]?.after ?? "");
      const storageUsed =
        e.is_storage_pad && header.is_storage_in
          ? header.storage_pads_used ?? 0
          : 0;
      return (
        after !== null &&
        e.dispatch_count !== null &&
        after + storageUsed < e.dispatch_count
      );
    });
    let confirmMsg = adminEditing
      ? "Save changes? Live inventory will be recalculated."
      : "Complete this job? This updates live inventory and locks the sheet.";
    if (short.length) {
      confirmMsg =
        "⚠ EQUIPMENT MISSING:\n" +
        short
          .map(
            (e) =>
              `• ${e.name}: dispatched with ${e.dispatch_count}, only ${numInt(
                equip[e.equipment_id].after
              )} now`
          )
          .join("\n") +
        "\n\n" +
        confirmMsg;
    }
    if (!window.confirm(confirmMsg)) return;
    setMessage(null);
    run(
      () => completeJob(jobId, header, toInputs(), toEquip("after")),
      adminEditing ? "Changes saved." : null,
      () => setEditing(false) // re-lock after completing / saving changes
    );
  };

  const handleAddJob = () =>
    run(() => createJob(truckId, jobDate, false, area), undefined);

  // Red outline for an empty required field once a submit has been attempted.
  const reqErr = (v?: string | null) =>
    triedSubmit && !v?.trim() ? " border-red-500 bg-red-100/40" : "";

  // Material counts allow halves, so use the decimal keypad (has a ".").
  const numProps = { inputMode: "decimal" as const, disabled: locked };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-navy-700">
            {truckName} — Job #{sequenceNo}
          </h1>
          <p className="font-ui text-sm text-navy-500">{jobDate}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-ui text-sm font-semibold ${
            phase === "done"
              ? "bg-success/15 text-success"
              : phase === "afterjob"
              ? "bg-reassure-300/40 text-navy-700"
              : "bg-warning/15 text-warning"
          }`}
        >
          {phase === "done"
            ? "Completed"
            : phase === "afterjob"
            ? "Dispatched"
            : "New"}
          {adminEditing ? " · editing" : ""}
        </span>
      </div>

      {/* Step banner */}
      <div
        className={`mb-4 rounded-lg border-2 px-3 py-2 font-ui text-sm ${
          phase === "dispatch"
            ? "border-reassure-300 bg-reassure-100 text-navy-700"
            : "border-success/40 bg-success/10 text-navy-700"
        }`}
      >
        {phase === "dispatch" ? (
          <>
            <strong>Step 1 of 2 — Dispatch.</strong>{" "}
            {isFirstOfDay
              ? "Count the truck (Pre-Dispatch), load to Par (or higher for a packing job), enter Post-Dispatch, then tap Finished Dispatch."
              : "Count what's on the truck (Pre-Dispatch), then tap Finished Dispatch."}{" "}
            You&apos;ll fill the After-Job count when you wrap up.
          </>
        ) : phase === "afterjob" ? (
          <>
            <strong>Step 2 of 2 — After the job.</strong> Enter the After-Job
            count for each item to get the final Used totals
            {header.is_storage_in ? ", and the furniture pads used" : ""}, then
            tap Complete Job.
          </>
        ) : (
          <>This job is completed and locked.</>
        )}
      </div>

      {/* Header / metadata (all required) */}
      <div className="mb-4 grid grid-cols-1 gap-3 gg-surface p-4 sm:grid-cols-2">
        <Field label="Customer *">
          <input
            className={`gg-input w-full${reqErr(header.customer)}`}
            value={header.customer ?? ""}
            disabled={locked}
            onChange={(e) =>
              setHeader((h) => ({ ...h, customer: e.target.value }))
            }
          />
        </Field>
        <Field label="Job # *">
          <input
            className={`gg-input w-full${reqErr(header.job_number)}`}
            value={header.job_number ?? ""}
            disabled={locked}
            onChange={(e) =>
              setHeader((h) => ({ ...h, job_number: e.target.value }))
            }
          />
        </Field>
        <Field label="Crew Lead *">
          <input
            className={`gg-input w-full${reqErr(header.crew_lead)}`}
            value={header.crew_lead ?? ""}
            disabled={locked}
            onChange={(e) =>
              setHeader((h) => ({ ...h, crew_lead: e.target.value }))
            }
          />
        </Field>
        {/* Not wrapped in <Field> (a <label>): a label forwards inner clicks to
            its first control, which would re-toggle the dropdown on "Done". */}
        <div className="block">
          <span className="gg-eyebrow mb-1 block">Crew *</span>
          <CrewPicker
            options={crew}
            value={header.crew ?? ""}
            disabled={locked}
            invalid={triedSubmit && !header.crew?.trim()}
            onChange={(v) => setHeader((h) => ({ ...h, crew: v }))}
          />
        </div>
      </div>

      {/* Storage-In */}
      <div
        className={`mb-4 rounded-xl border-2 p-4 ${
          header.is_storage_in
            ? "border-red-500 bg-red-100/40"
            : "border-navy-100 bg-cream-50"
        }`}
      >
        <label className="flex items-center gap-2 font-ui text-sm font-semibold text-navy-700">
          <input
            type="checkbox"
            className="h-5 w-5"
            disabled={locked}
            checked={header.is_storage_in}
            onChange={(e) =>
              setHeader((h) => ({ ...h, is_storage_in: e.target.checked }))
            }
          />
          Storage-In job (furniture pads stay in storage)
        </label>
        {header.is_storage_in && (
          <p className="mt-2 font-ui text-xs text-navy-500">
            In Step 2 you&apos;ll enter <strong>pads left in storage</strong> on
            the Furniture Pads row of the Equipment Checklist below — that count
            is charged to the customer and deducted from total pads on hand.
          </p>
        )}
      </div>

      {/* Routines */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RoutineCard
          title="Morning Routine"
          items={morningItems}
          values={header.morning_routine}
          disabled={locked}
          onToggle={(key, v) =>
            setHeader((h) => ({
              ...h,
              morning_routine: { ...h.morning_routine, [key]: v },
            }))
          }
        />
        <RoutineCard
          title="Close Routine"
          items={closeItems}
          values={header.close_routine}
          disabled={locked}
          onToggle={(key, v) =>
            setHeader((h) => ({
              ...h,
              close_routine: { ...h.close_routine, [key]: v },
            }))
          }
        />
      </div>

      {/* ===== Counts — desktop table ===== */}
      <div className="hidden overflow-x-auto rounded-xl border-2 border-navy-700 bg-cream-50 shadow-sign sm:block">
        <table className="w-full text-sm">
          <thead className="gg-thead">
            <tr>
              <th className="px-3 py-2.5 text-left">Item</th>
              <th className="px-2 py-2.5 text-center">Pre-Dispatch</th>
              {isFirstOfDay && (
                <th className="px-2 py-2.5 text-center">Post-Dispatch</th>
              )}
              {showAfterJob && (
                <th className="px-2 py-2.5 text-center">After Job</th>
              )}
              {isFirstOfDay && (
                <th className="px-2 py-2.5 text-center">To Be Added</th>
              )}
              {showAfterJob && <th className="px-2 py-2.5 text-center">Used</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-300">
            {counts.map((c) => {
              const used = usedOf(c);
              const tba = toBeAdded(c);
              return (
                <tr key={c.material_id}>
                  <td className="px-3 py-2 font-semibold text-navy-700">
                    {c.name}
                    <span className="ml-2 font-ui text-xs font-normal text-navy-300">
                      par {c.par}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      {...numProps}
                      className="gg-input-num"
                      value={c.pre_dispatch ?? ""}
                      onChange={(e) =>
                        setCount(c.material_id, "pre_dispatch", e.target.value)
                      }
                    />
                  </td>
                  {isFirstOfDay && (
                    <td className="px-2 py-2 text-center">
                      <input
                        {...numProps}
                        className="gg-input-num"
                        placeholder={`${c.par}`}
                        value={c.post_dispatch ?? ""}
                        onChange={(e) =>
                          setCount(c.material_id, "post_dispatch", e.target.value)
                        }
                      />
                    </td>
                  )}
                  {showAfterJob && (
                    <td className="px-2 py-2 text-center">
                      <input
                        {...numProps}
                        className="gg-input-num"
                        value={c.post_job ?? ""}
                        onChange={(e) =>
                          setCount(c.material_id, "post_job", e.target.value)
                        }
                      />
                    </td>
                  )}
                  {isFirstOfDay && (
                    <td
                      className={`px-2 py-2 text-center font-ui font-bold ${
                        tba && tba > 0 ? "text-navy-700" : "text-navy-300"
                      }`}
                    >
                      {tba ?? "—"}
                    </td>
                  )}
                  {showAfterJob && (
                    <td
                      className={`px-2 py-2 text-center font-ui font-bold ${
                        used && used > 0 ? "text-red-500" : "text-navy-300"
                      }`}
                    >
                      {used ?? "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {showAfterJob && (
            <tfoot>
              <tr className="border-t-2 border-navy-200 bg-cream-200 font-semibold text-navy-700">
                <td
                  className="px-3 py-2.5"
                  colSpan={isFirstOfDay ? 5 : 3}
                >
                  Total Used (Charge)
                </td>
                <td className="px-2 py-2.5 text-center font-ui font-bold text-red-500">
                  {totalUsed}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ===== Counts — mobile cards ===== */}
      <div className="space-y-2 sm:hidden">
        {counts.map((c) => {
          const used = usedOf(c);
          const tba = toBeAdded(c);
          return (
            <div
              key={c.material_id}
              className="rounded-xl border-2 border-navy-100 bg-cream-50 p-3"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-display font-bold text-navy-700">
                  {c.name}
                </span>
                <span className="gg-eyebrow">par {c.par}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MobileNum
                  label="Pre"
                  value={c.pre_dispatch}
                  disabled={locked}
                  onChange={(v) => setCount(c.material_id, "pre_dispatch", v)}
                />
                {isFirstOfDay && (
                  <MobileNum
                    label="Post-Disp"
                    value={c.post_dispatch}
                    disabled={locked}
                    onChange={(v) => setCount(c.material_id, "post_dispatch", v)}
                  />
                )}
                {showAfterJob && (
                  <MobileNum
                    label="After Job"
                    value={c.post_job}
                    disabled={locked}
                    onChange={(v) => setCount(c.material_id, "post_job", v)}
                  />
                )}
              </div>
              {isFirstOfDay && (
                <div className="mt-2 flex items-center justify-between border-t border-cream-300 pt-2">
                  <span className="gg-eyebrow">To Be Added (Par − Pre)</span>
                  <span className="font-ui text-base font-bold text-navy-700">
                    {tba ?? "—"}
                  </span>
                </div>
              )}
              {showAfterJob && (
                <div className="mt-2 flex items-center justify-between border-t border-cream-300 pt-2">
                  <span className="gg-eyebrow">Used (Charge)</span>
                  <span
                    className={`font-ui text-xl font-bold ${
                      used && used > 0 ? "text-red-500" : "text-navy-300"
                    }`}
                  >
                    {used ?? "—"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {showAfterJob && (
          <div className="flex items-center justify-between rounded-xl border-2 border-navy-700 bg-cream-200 px-3 py-3 font-semibold text-navy-700">
            <span>Total Used (Charge)</span>
            <span className="font-ui text-xl font-bold text-red-500">
              {totalUsed}
            </span>
          </div>
        )}
      </div>

      {/* Equipment checklist (reusable gear) */}
      {initialEquipment.length > 0 && (
        <div className="gg-surface mt-4 p-4">
          <h3 className="mb-1 font-display text-base font-bold text-navy-700">
            Equipment Checklist
          </h3>
          <p className="mb-3 font-ui text-xs text-navy-500">
            {phase === "dispatch"
              ? "Count how many of each are on the truck."
              : "Count how many you see now — you'll be warned if anything's missing."}
          </p>
          <div className="space-y-2">
            {initialEquipment.map((e) => {
              const st =
                equip[e.equipment_id] ?? { dispatch: "", after: "", checked: false };
              const field = phase === "dispatch" ? "dispatch" : "after";
              const afterNum = numInt(st.after);
              // Furniture Pads on a Storage-In job: pads left in storage leave
              // the truck legitimately, so they count toward "accounted for".
              const storagePadRow = e.is_storage_pad && header.is_storage_in;
              const storageUsed = storagePadRow
                ? header.storage_pads_used ?? 0
                : 0;
              const isShort =
                phase !== "dispatch" &&
                afterNum !== null &&
                e.dispatch_count !== null &&
                afterNum + storageUsed < e.dispatch_count;
              return (
                <div
                  key={e.equipment_id}
                  className={`flex flex-wrap items-center gap-2 rounded-md border-2 px-3 py-2 ${
                    isShort
                      ? "border-red-500 bg-red-100/40"
                      : "border-navy-100 bg-cream-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    disabled={locked}
                    checked={st.checked}
                    onChange={(ev) =>
                      setEq(e.equipment_id, "checked", ev.target.checked)
                    }
                  />
                  <span className="flex-1 font-ui text-sm font-semibold text-navy-700">
                    {e.name}{" "}
                    <span className="font-normal text-navy-300">par {e.par}</span>
                  </span>
                  {phase !== "dispatch" && e.dispatch_count !== null && (
                    <span className="font-ui text-xs text-navy-400">
                      dispatched {e.dispatch_count}
                    </span>
                  )}
                  <input
                    inputMode="numeric"
                    disabled={locked}
                    className="gg-input-num"
                    placeholder={`${e.par}`}
                    value={field === "dispatch" ? st.dispatch : st.after}
                    onChange={(ev) => {
                      setEq(e.equipment_id, field, ev.target.value);
                      // Storage-In: pads left in storage auto-fill from
                      // dispatched − remaining on the truck.
                      if (storagePadRow && field === "after") {
                        const a = numInt(ev.target.value);
                        const left =
                          a !== null && e.dispatch_count !== null
                            ? Math.max(0, e.dispatch_count - a)
                            : null;
                        setHeader((h) => ({ ...h, storage_pads_used: left }));
                      }
                    }}
                  />
                  {isShort && (
                    <span className="font-ui text-xs font-bold text-red-500">
                      short!
                    </span>
                  )}
                  {/* Storage-In: pads left in storage (charged + deducted) */}
                  {storagePadRow && showAfterJob && (
                    <div className="mt-1 w-full border-t border-navy-100 pt-2">
                      <span className="gg-eyebrow mb-1 block text-red-600">
                        Pads left in storage — charge customer · required
                      </span>
                      <input
                        inputMode="numeric"
                        disabled={locked}
                        className="gg-input-num"
                        placeholder="0"
                        value={header.storage_pads_used ?? ""}
                        onChange={(ev) =>
                          setHeader((h) => ({
                            ...h,
                            storage_pads_used: numInt(ev.target.value),
                          }))
                        }
                      />
                      <span className="ml-2 font-ui text-xs text-navy-500">
                        auto-filled from dispatched − on truck · edit if needed ·
                        deducted from total pads on hand at completion
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SmartMoving confirmation (after-job step) */}
      {showAfterJob && (
        <label className="mt-4 flex items-center gap-2 font-ui text-sm text-navy-600">
          <input
            type="checkbox"
            className="h-5 w-5"
            disabled={locked}
            checked={header.entered_in_smartmoving}
            onChange={(e) =>
              setHeader((h) => ({
                ...h,
                entered_in_smartmoving: e.target.checked,
              }))
            }
          />
          Entered in SmartMoving — all USED quantities entered on the iPad before
          leaving the customer.
        </label>
      )}

      {errors.length > 0 ? (
        <div className="mt-3 rounded-lg border-2 border-red-500 bg-red-100/50 p-3">
          <p className="font-ui text-sm font-bold text-red-600">
            Can&apos;t submit yet — please complete:
          </p>
          <ul className="mt-1 list-disc pl-5 font-ui text-sm font-semibold text-red-700">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : message ? (
        <p className="mt-3 font-ui text-sm font-semibold text-navy-600">
          {message}
        </p>
      ) : null}

      {/* Actions */}
      <div className="sticky bottom-0 mt-5 flex flex-wrap gap-3 border-t-2 border-cream-300 bg-cream-100 py-3">
        {phase === "dispatch" && (
          <>
            <button
              onClick={handleDispatch}
              disabled={pending}
              className="gg-btn-cta"
            >
              {pending ? "Saving…" : "Finished Dispatch →"}
            </button>
            <a href={homeHref} className="gg-btn-ghost">
              Cancel
            </a>
          </>
        )}
        {phase === "afterjob" && (
          <>
            <button
              onClick={handleSaveProgress}
              disabled={pending}
              className="gg-btn-ghost"
            >
              {pending ? "Saving…" : "Save Progress"}
            </button>
            <button
              onClick={handleComplete}
              disabled={pending}
              className="gg-btn-cta"
            >
              Complete Job — Final Count
            </button>
          </>
        )}
        {phase === "done" &&
          (adminEditing ? (
            <>
              <button
                onClick={handleComplete}
                disabled={pending}
                className="gg-btn-cta"
              >
                {pending ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setMessage(null);
                }}
                disabled={pending}
                className="gg-btn-ghost"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {isAdmin && (
                <button
                  onClick={() => setEditing(true)}
                  disabled={pending}
                  className="gg-btn-ghost"
                >
                  Edit job
                </button>
              )}
              <button
                onClick={handleAddJob}
                disabled={pending}
                className="gg-btn-primary"
              >
                + Add Next Job (same truck)
              </button>
              <a href={homeHref} className="gg-btn-ghost">
                {homeLabel}
              </a>
            </>
          ))}
      </div>
    </div>
  );
}

function MobileNum({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-center font-ui text-[11px] font-semibold uppercase tracking-wide text-navy-500">
        {label}
      </span>
      <input
        inputMode="decimal"
        disabled={disabled}
        className="font-ui w-full rounded-md border-2 border-navy-200 bg-cream-50 py-2.5 text-center text-lg text-navy-700 outline-none focus:border-navy-700 disabled:bg-cream-200 disabled:text-navy-300"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// The crew roster is admin-managed (see Admin → Crew Roster) and passed in as
// `options`. Any names already saved on the job but no longer on the roster are
// still shown (and stay selected) so historical/in-progress sheets never lose
// data.
function CrewPicker({
  options,
  value,
  disabled,
  invalid,
  onChange,
}: {
  options: string[];
  value: string;
  disabled: boolean;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Show roster names plus any selected name that's no longer on the roster.
  const names = [
    ...options,
    ...selected.filter((s) => !options.includes(s)),
  ];
  const toggle = (name: string) => {
    const set = new Set(selected);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    onChange(names.filter((n) => set.has(n)).join(", "));
  };
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`gg-input flex w-full items-center justify-between gap-2 text-left disabled:opacity-60${
          invalid ? " border-red-500 bg-red-100/40" : ""
        }`}
      >
        <span className={selected.length ? "text-navy-700" : "text-navy-300"}>
          {selected.length ? selected.join(", ") : "Select crew…"}
        </span>
        <span className="shrink-0 text-navy-400">▾</span>
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border-2 border-navy-700 bg-cream-50 p-1 shadow-sign">
          {names.length === 0 && (
            <p className="px-3 py-2 font-ui text-sm text-navy-300">
              No crew members yet — add them in Admin.
            </p>
          )}
          {names.map((name) => {
            const on = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-ui text-sm ${
                  on
                    ? "bg-navy-700 text-cream-50"
                    : "text-navy-700 hover:bg-cream-200"
                }`}
              >
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-current text-[10px] font-bold">
                  {on ? "✓" : ""}
                </span>
                {name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 w-full rounded-md bg-cream-200 px-3 py-2 font-ui text-sm font-semibold text-navy-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="gg-eyebrow mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function RoutineCard({
  title,
  items,
  values,
  disabled,
  onToggle,
}: {
  title: string;
  items: { id: number; label: string }[];
  values: Record<string, boolean>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <div className="gg-surface p-4">
      <h3 className="mb-2 font-display text-base font-bold text-navy-700">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="font-ui text-sm text-navy-300">No checklist items.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const key = String(it.id);
            return (
              <label
                key={it.id}
                className="flex items-center gap-2 font-ui text-sm text-navy-600"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  disabled={disabled}
                  checked={!!values[key]}
                  onChange={(e) => onToggle(key, e.target.checked)}
                />
                {it.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
