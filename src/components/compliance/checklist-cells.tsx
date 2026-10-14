'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, ExternalLink, FileText, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { StateBadge } from '@/components/compliance/state-badge';
import { addMonths, todayLocalIso } from '@/lib/compliance/status';
import { validateUpload } from '@/lib/upload-limits';
import { recordOdometer } from '@/lib/compliance/vehicle-actions';
import { setCheck, saveSlot, logSlotService } from '@/lib/compliance/checklist-actions';
import type { ItemSlot, PmSlot, SlotCheck, SlotItem, SlotPm } from '@/lib/compliance/checklists';

/**
 * Cells and dialogs for the owned-truck and driver checklist grids.
 *
 * Each dialog's form is its own component, rendered only while open and keyed to
 * what it edits, so it mounts with its fields seeded from props — the same
 * pattern the Morning Meeting promote dialog uses, for the same reason (Radix
 * never fires onOpenChange on the way in when the parent opens it).
 */

type Result = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<Result>, ok: string, onDone?: () => void) {
    startTransition(async () => {
      let result: Result;
      try {
        result = await fn();
      } catch {
        // A rejected request (e.g. an oversized body) throws instead of returning
        // { ok: false } — without this it takes down the whole page.
        result = { ok: false, error: 'That did not save. Check your connection and try again.' };
      }
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      toast.success(ok);
      onDone?.();
      router.refresh();
    });
  }
  return { pending, run };
}

const cellButton =
  'inline-flex flex-col items-start gap-1 rounded-md px-1.5 py-1 text-left hover:bg-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// ── Yes/no ───────────────────────────────────────────────────────────────────

export function CheckCell({
  entity,
  parentId,
  slotKey,
  label,
  value,
}: {
  entity: 'vehicle' | 'employee';
  parentId: string;
  slotKey: string;
  label: string;
  value: SlotCheck | undefined;
}) {
  const { pending, run } = useAction();
  const checked = value?.checked ?? false;
  const title = value?.checked_on
    ? `${checked ? 'Checked' : 'Unchecked'} ${formatDate(value.checked_on, 'MMM d, yyyy')}${
        value.checked_by_name ? ` by ${value.checked_by_name}` : ''
      }`
    : 'Not checked yet';

  return (
    <div className="flex flex-col items-start gap-0.5" title={title}>
      <Checkbox
        checked={checked}
        disabled={pending}
        aria-label={label}
        onCheckedChange={(next) =>
          run(
            () => setCheck({ entity, parentId, key: slotKey, checked: next === true }),
            next === true ? `${label} ✓` : `${label} cleared`
          )
        }
      />
      {value?.checked_on && (
        <span className="text-[10px] text-muted-foreground">
          {formatDate(value.checked_on, 'M/d/yy')}
        </span>
      )}
    </div>
  );
}

// ── Dated / uploaded item ────────────────────────────────────────────────────

/** What a dated slot shows in the grid: its state and expiration, or "Add". */
export function ItemCell({ value, onOpen }: { value: SlotItem | undefined; onOpen: () => void }) {
  if (!value || (!value.expiration_date && value.files.length === 0)) {
    return (
      <button type="button" className={`${cellButton} text-muted-foreground`} onClick={onOpen}>
        <span className="inline-flex items-center gap-1 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add
        </span>
      </button>
    );
  }
  return (
    <button type="button" className={cellButton} onClick={onOpen}>
      {value.expiration_date ? (
        <>
          <StateBadge state={value.state} daysUntil={value.days_until} />
          <span className="text-xs text-muted-foreground">
            exp {formatDate(value.expiration_date, 'MMM d, yyyy')}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">No date yet</span>
      )}
      {value.files.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3" /> {value.files.length} file{value.files.length === 1 ? '' : 's'}
        </span>
      )}
    </button>
  );
}

/** A document slot (driver application, road test): uploaded or not. */
export function DocCell({ value, onOpen }: { value: SlotItem | undefined; onOpen: () => void }) {
  const count = value?.files.length ?? 0;
  return (
    <button type="button" className={cellButton} onClick={onOpen}>
      {count > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded{count > 1 ? ` (${count})` : ''}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Upload className="h-3.5 w-3.5" /> Upload
        </span>
      )}
    </button>
  );
}

export interface ItemDialogTarget {
  entity: 'vehicle' | 'employee';
  parentId: string;
  parentName: string;
  slot: ItemSlot;
  value: SlotItem | undefined;
}

export function ItemDialog({
  target,
  storageReady,
  onClose,
}: {
  target: ItemDialogTarget | null;
  storageReady: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && (
          <ItemForm
            key={`${target.parentId}-${target.slot.key}`}
            target={target}
            storageReady={storageReady}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  target,
  storageReady,
  onClose,
}: {
  target: ItemDialogTarget;
  storageReady: boolean;
  onClose: () => void;
}) {
  const { slot, value } = target;
  const { pending, run } = useAction();
  const [issueDate, setIssueDate] = useState(value?.issue_date ?? '');
  const [expirationDate, setExpirationDate] = useState(value?.expiration_date ?? '');
  // Once the expiration is typed by hand, stop overwriting it from the done date.
  const [expTouched, setExpTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Upload-only slots with no expiry (driver application, road test) take no dates.
  const takesExpiration = slot.cadenceMonths != null;

  function onIssueDate(next: string) {
    setIssueDate(next);
    if (!expTouched && next && slot.cadenceMonths) {
      setExpirationDate(addMonths(next, slot.cadenceMonths));
    }
  }

  function save() {
    const fd = new FormData();
    fd.set('entity', target.entity);
    fd.set('parentId', target.parentId);
    fd.set('key', slot.key);
    // Only send dates that changed — re-saving an unchanged date would add a
    // duplicate renewal to the item's history.
    if (issueDate && issueDate !== (value?.issue_date ?? '')) fd.set('issueDate', issueDate);
    if (expirationDate && expirationDate !== (value?.expiration_date ?? '')) {
      fd.set('expirationDate', expirationDate);
      if (issueDate) fd.set('issueDate', issueDate);
    }
    if (file) {
      // Checked here as well as on the server: an oversized file never reaches the
      // server's check — the request is refused before the action runs.
      const invalid = validateUpload(file);
      if (invalid) {
        toast.error(invalid, { duration: 8000 });
        return;
      }
      fd.set('file', file);
    }
    run(() => saveSlot(fd), `${slot.short} saved`, onClose);
  }

  const changed =
    !!file ||
    (issueDate !== '' && issueDate !== (value?.issue_date ?? '')) ||
    (expirationDate !== '' && expirationDate !== (value?.expiration_date ?? ''));

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {slot.name} — {target.parentName}
        </DialogTitle>
        <DialogDescription>
          {takesExpiration
            ? slot.dateLabel
              ? `Expiration fills in ${slot.cadenceMonths} months after the date you enter. Change it if the paperwork says otherwise.`
              : 'Enter the expiration printed on the card, and attach a copy.'
            : 'Attach the signed copy. It is only visible to the back office.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {takesExpiration && (
          <div className="grid gap-3 sm:grid-cols-2">
            {slot.dateLabel && (
              <div className="space-y-2">
                <Label htmlFor="slot-issue">{slot.dateLabel}</Label>
                <Input
                  id="slot-issue"
                  type="date"
                  value={issueDate}
                  onChange={(e) => onIssueDate(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="slot-exp">Expires</Label>
              <Input
                id="slot-exp"
                type="date"
                value={expirationDate}
                onChange={(e) => {
                  setExpTouched(true);
                  setExpirationDate(e.target.value);
                }}
              />
            </div>
          </div>
        )}

        {value && value.files.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {value.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 p-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={`/api/documents/${f.document_id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-1 truncate hover:underline"
                >
                  {f.title}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatDate(f.created_at, 'MMM d, yyyy')}
                </span>
              </li>
            ))}
          </ul>
        )}

        {storageReady ? (
          <div className="space-y-2">
            <Label htmlFor="slot-file">
              {value?.files.length ? 'Add another file' : slot.upload ? 'File' : 'Copy (optional)'}
            </Label>
            <Input
              id="slot-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">PDF, photo, or Office file up to 4 MB.</p>
          </div>
        ) : (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-muted-foreground">
            File storage isn&apos;t connected, so uploads are unavailable.
          </p>
        )}

        {value && (
          <a
            href={`/admin/compliance/items/${value.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Full record and history <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !changed}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── PM / oil change ──────────────────────────────────────────────────────────

export function PmCell({ value, onOpen }: { value: SlotPm | undefined; onOpen: () => void }) {
  if (!value || (!value.last_service_date && value.last_service_odometer == null)) {
    return (
      <button type="button" className={`${cellButton} text-muted-foreground`} onClick={onOpen}>
        <span className="inline-flex items-center gap-1 text-xs">
          <Plus className="h-3.5 w-3.5" /> Log last
        </span>
      </button>
    );
  }
  const daysLate = value.days_until != null && value.days_until < 0;
  return (
    <button type="button" className={cellButton} onClick={onOpen}>
      <StateBadge state={value.state} />
      <span className="text-xs text-muted-foreground">
        {value.next_due_date && (
          <span className={daysLate ? 'text-destructive' : undefined}>
            due {formatDate(value.next_due_date, 'MMM d')}
          </span>
        )}
        {value.next_due_date && value.next_due_odometer != null && ' · '}
        {value.next_due_odometer != null && (
          <span
            className={
              value.miles_remaining != null && value.miles_remaining < 0 ? 'text-destructive' : undefined
            }
          >
            {value.next_due_odometer.toLocaleString()} mi
          </span>
        )}
      </span>
    </button>
  );
}

export interface PmDialogTarget {
  vehicleId: string;
  vehicleName: string;
  currentOdometer: number | null;
  slot: PmSlot;
  value: SlotPm | undefined;
}

export function PmDialog({ target, onClose }: { target: PmDialogTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && (
          <PmForm key={`${target.vehicleId}-${target.slot.key}`} target={target} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PmForm({ target, onClose }: { target: PmDialogTarget; onClose: () => void }) {
  const { slot, value } = target;
  const { pending, run } = useAction();
  const [serviceDate, setServiceDate] = useState(todayLocalIso());
  const [odometer, setOdometer] = useState(
    target.currentOdometer != null ? String(target.currentOdometer) : ''
  );

  const miles = value?.interval_miles ?? slot.intervalMiles;
  const days = value?.interval_days ?? slot.intervalDays;
  const months = Math.round(days / 30.4);

  function save() {
    const parsed = odometer.trim() ? Number(odometer.replace(/,/g, '')) : null;
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('Enter the mileage as a number');
      return;
    }
    run(
      () => logSlotService({ vehicleId: target.vehicleId, key: slot.key, serviceDate, odometer: parsed }),
      `${slot.label} logged`,
      onClose
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Log {slot.label.toLowerCase()} — {target.vehicleName}
        </DialogTitle>
        <DialogDescription>
          Due every {miles.toLocaleString()} miles or {months} months, whichever comes first.
          {value?.last_service_date &&
            ` Last done ${formatDate(value.last_service_date, 'MMM d, yyyy')}${
              value.last_service_odometer != null
                ? ` at ${value.last_service_odometer.toLocaleString()} mi`
                : ''
            }.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pm-date">Service date</Label>
          <Input id="pm-date" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-odo">Odometer at service</Label>
          <Input
            id="pm-odo"
            inputMode="numeric"
            placeholder="e.g. 84,210"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Without the mileage, only the date clock runs. Change the intervals on the truck&apos;s page.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !serviceDate}>
          {pending ? 'Saving…' : 'Log service'}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Odometer ─────────────────────────────────────────────────────────────────

export function OdometerCell({
  odometer,
  updatedOn,
  onOpen,
}: {
  odometer: number | null;
  updatedOn: string | null;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={cellButton} onClick={onOpen}>
      {odometer != null ? (
        <>
          <span className="text-sm tabular-nums">{odometer.toLocaleString()} mi</span>
          {updatedOn && (
            <span className="text-[11px] text-muted-foreground">{formatDate(updatedOn, 'MMM d')}</span>
          )}
        </>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Plus className="h-3.5 w-3.5" /> Enter
        </span>
      )}
    </button>
  );
}

export interface OdometerDialogTarget {
  vehicleId: string;
  vehicleName: string;
  current: number | null;
}

export function OdometerDialog({
  target,
  onClose,
}: {
  target: OdometerDialogTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && <OdometerForm key={target.vehicleId} target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function OdometerForm({ target, onClose }: { target: OdometerDialogTarget; onClose: () => void }) {
  const { pending, run } = useAction();
  const [date, setDate] = useState(todayLocalIso());
  const [miles, setMiles] = useState('');

  function save() {
    const parsed = Number(miles.replace(/,/g, ''));
    if (!miles.trim() || !Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter the mileage as a number');
      return;
    }
    run(
      () => recordOdometer({ vehicleId: target.vehicleId, readingDate: date, odometer: parsed }),
      'Mileage updated',
      onClose
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Current mileage — {target.vehicleName}</DialogTitle>
        <DialogDescription>
          The mileage clocks on PM and oil changes count from this.
          {target.current != null && ` Last reading: ${target.current.toLocaleString()} mi.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="odo-date">Date</Label>
          <Input id="odo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="odo-miles">Odometer</Label>
          <Input
            id="odo-miles"
            inputMode="numeric"
            placeholder="e.g. 84,210"
            value={miles}
            onChange={(e) => setMiles(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !date || !miles.trim()}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}
