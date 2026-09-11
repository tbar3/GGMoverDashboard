'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Paperclip, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { StateBadge } from '@/components/compliance/state-badge';
import { saveItem, type ItemInput } from '@/lib/compliance/actions';
import { deriveState } from '@/lib/compliance/status';
import {
  CADENCE_OPTIONS,
  COMPLIANCE_CATEGORIES,
  ENTITY_TYPES,
  ITEM_STATUSES,
  categoryLabel,
  type ComplianceItemRow,
} from '@/lib/compliance/types';
import type { EmployeeOption } from '@/lib/compliance/queries';

/** The select components need a non-empty value, so "any" stands in for "no filter". */
const ANY = '__any__';
const NONE = '__none__';

type FormState = {
  name: string;
  category: string;
  entityType: string;
  vehicleId: string;
  entityEmployeeId: string;
  issuingAuthority: string;
  identifier: string;
  issueDate: string;
  expirationDate: string;
  cadenceMonths: string;
  leadTimeDays: string;
  cost: string;
  ownerEmployeeId: string;
  status: string;
  externalUrl: string;
  notes: string;
};

/** A function, not a constant, so defaults are fresh each time the dialog opens. */
function emptyForm(): FormState {
  return {
    name: '',
    category: 'other',
    entityType: 'company',
    vehicleId: '',
    entityEmployeeId: '',
    issuingAuthority: '',
    identifier: '',
    issueDate: '',
    expirationDate: '',
    cadenceMonths: '12',
    leadTimeDays: '30',
    cost: '',
    ownerEmployeeId: '',
    status: 'active',
    externalUrl: '',
    notes: '',
  };
}

function toForm(item: ComplianceItemRow): FormState {
  return {
    name: item.name,
    category: item.category,
    entityType: item.entity_type,
    vehicleId: item.vehicle_id ?? '',
    entityEmployeeId: item.entity_employee_id ?? '',
    issuingAuthority: item.issuing_authority ?? '',
    identifier: item.identifier ?? '',
    issueDate: item.issue_date?.slice(0, 10) ?? '',
    expirationDate: item.expiration_date?.slice(0, 10) ?? '',
    cadenceMonths: item.cadence_months != null ? String(item.cadence_months) : '',
    leadTimeDays: String(item.lead_time_days),
    cost: item.cost != null ? String(item.cost) : '',
    ownerEmployeeId: item.owner_employee_id ?? '',
    status: item.status,
    externalUrl: item.external_url ?? '',
    notes: item.notes ?? '',
  };
}

export default function ItemsClient({
  items,
  employees,
  vehicles,
  currentEmployeeId,
}: {
  items: ComplianceItemRow[];
  employees: EmployeeOption[];
  vehicles: { id: string; name: string }[];
  currentEmployeeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceItemRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState(ANY);
  const [categoryFilter, setCategoryFilter] = useState(ANY);
  const [entityFilter, setEntityFilter] = useState(ANY);
  // Lifecycle, not urgency. Defaults to active: archived and not-applicable rows
  // are the long tail and never need action, but they stay one click away.
  const [lifecycleFilter, setLifecycleFilter] = useState('active');
  const [mineOnly, setMineOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (lifecycleFilter !== ANY && item.status !== lifecycleFilter) return false;
      if (stateFilter !== ANY && item.state !== stateFilter) return false;
      if (categoryFilter !== ANY && item.category !== categoryFilter) return false;
      if (entityFilter !== ANY && item.entity_type !== entityFilter) return false;
      if (mineOnly && item.owner_employee_id !== currentEmployeeId) return false;
      if (!needle) return true;
      return [item.name, item.issuing_authority, item.identifier, item.vehicle_name, item.entity_employee_name]
        .some((field) => field?.toLowerCase().includes(needle));
    });
  }, [items, search, stateFilter, categoryFilter, entityFilter, lifecycleFilter, mineOnly, currentEmployeeId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(item: ComplianceItemRow) {
    setEditing(item);
    setForm(toForm(item));
    setDialogOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: ItemInput = {
      id: editing?.id,
      name: form.name,
      category: form.category,
      entityType: form.entityType,
      vehicleId: form.vehicleId || null,
      entityEmployeeId: form.entityEmployeeId || null,
      issuingAuthority: form.issuingAuthority,
      identifier: form.identifier,
      issueDate: form.issueDate || null,
      expirationDate: form.expirationDate || null,
      cadenceMonths: form.cadenceMonths ? Number(form.cadenceMonths) : null,
      leadTimeDays: Number(form.leadTimeDays || 0),
      cost: form.cost ? Number(form.cost) : null,
      ownerEmployeeId: form.ownerEmployeeId || null,
      status: form.status,
      externalUrl: form.externalUrl,
      notes: form.notes,
    };
    startTransition(async () => {
      const result = await saveItem(payload);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      toast.success(editing ? 'Item updated' : 'Item added');
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
      router.refresh();
    });
  }

  // Live preview of what this item will look like on the dashboard, so a lead
  // time can be chosen against a real answer instead of guessed at.
  const previewState = deriveState(
    form.expirationDate || null,
    Number(form.leadTimeDays || 0)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance Items</h1>
          <p className="text-muted-foreground mt-1">
            Every registration, filing, permit, policy, and card the company has to keep current.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, authority, policy number…"
              />
            </div>
            <FilterSelect
              label="Status"
              value={stateFilter}
              onChange={setStateFilter}
              options={[
                { value: 'expired', label: 'Expired' },
                { value: 'due_soon', label: 'Due soon' },
                { value: 'ok', label: 'OK' },
                { value: 'no_expiry', label: 'No expiry' },
              ]}
            />
            <FilterSelect
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={COMPLIANCE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            />
            <FilterSelect
              label="Applies to"
              value={entityFilter}
              onChange={setEntityFilter}
              options={ENTITY_TYPES.map((e) => ({ value: e.value, label: e.label }))}
            />
            <FilterSelect
              label="Lifecycle"
              value={lifecycleFilter}
              onChange={setLifecycleFilter}
              options={ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            />
            <Button
              variant={mineOnly ? 'default' : 'outline'}
              onClick={() => setMineOnly((v) => !v)}
            >
              Mine
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {items.length === 0
                        ? 'No compliance items yet. Add the first one to start tracking.'
                        : 'Nothing matches those filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          href={`/admin/compliance/items/${item.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {item.name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {item.issuing_authority && <span>{item.issuing_authority}</span>}
                          {item.identifier && <span className="font-mono">{item.identifier}</span>}
                          {item.attachment_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              {item.attachment_count}
                            </span>
                          )}
                          {item.needs_review && (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-3 w-3" />
                              Needs review
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.entity_type === 'company'
                          ? 'Company'
                          : item.vehicle_name ?? item.entity_employee_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {categoryLabel(item.category)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.expiration_date ? formatDate(item.expiration_date, 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        <StateBadge state={item.state} daysUntil={item.days_until} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.owner_name ?? (
                          <span className="text-destructive">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${item.name}`}
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit item' : 'Add compliance item'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Saving confirms the details and clears the "needs review" flag.'
                : 'Anything with a renewal date — a filing, a policy, a permit, a card.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Commercial Auto — Progressive"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => set('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPLIANCE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Applies to</Label>
                <Select
                  value={form.entityType}
                  onValueChange={(v) => {
                    set('entityType', v);
                    // Clear the other entity so a switched type can't carry a
                    // stale id into the CHECK constraint.
                    if (v !== 'vehicle') set('vehicleId', '');
                    if (v !== 'employee') set('entityEmployeeId', '');
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Whose obligation this is — not who renews it.
                </p>
              </div>
            </div>

            {form.entityType === 'vehicle' && (
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select value={form.vehicleId} onValueChange={(v) => set('vehicleId', v)}>
                  <SelectTrigger><SelectValue placeholder="Pick a vehicle" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.entityType === 'employee' && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select
                  value={form.entityEmployeeId}
                  onValueChange={(v) => set('entityEmployeeId', v)}
                >
                  <SelectTrigger><SelectValue placeholder="Pick an employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="authority">Issuing authority</Label>
                <Input
                  id="authority"
                  value={form.issuingAuthority}
                  onChange={(e) => set('issuingAuthority', e.target.value)}
                  placeholder="GA DPS, FMCSA, Progressive…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="identifier">Policy / permit number</Label>
                <Input
                  id="identifier"
                  value={form.identifier}
                  onChange={(e) => set('identifier', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issued</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => set('issueDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expirationDate">Expires</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  value={form.expirationDate}
                  onChange={(e) => set('expirationDate', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank if it never expires.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Renews</Label>
                <Select
                  value={form.cadenceMonths || NONE}
                  onValueChange={(v) => set('cadenceMonths', v === NONE ? '' : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CADENCE_OPTIONS.map((c) => (
                      <SelectItem key={c.value || NONE} value={c.value || NONE}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used to prefill the next expiration when you record a renewal.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadTimeDays">Warn me this many days ahead</Label>
                <Input
                  id="leadTimeDays"
                  type="number"
                  min={0}
                  value={form.leadTimeDays}
                  onChange={(e) => set('leadTimeDays', e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Right now this would show as{' '}
                  <StateBadge state={previewState} className="align-middle" />
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Responsible for renewal</Label>
                <Select
                  value={form.ownerEmployeeId || NONE}
                  onValueChange={(v) => set('ownerEmployeeId', v === NONE ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Typical cost</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.cost}
                  onChange={(e) => set('cost', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="externalUrl">Renewal link</Label>
                <Input
                  id="externalUrl"
                  type="url"
                  value={form.externalUrl}
                  onChange={(e) => set('externalUrl', e.target.value)}
                  placeholder="https://…"
                />
                <p className="text-xs text-muted-foreground">
                  The portal you log into to renew it.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Lifecycle</Label>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Archived and not-applicable items drop off the dashboard.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
