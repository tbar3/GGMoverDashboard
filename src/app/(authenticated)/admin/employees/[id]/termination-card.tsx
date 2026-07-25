'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserMinus, FileText, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Employee } from '@/types';
import { terminateEmployee, reactivateEmployee } from '../new/actions';

const TYPES = [
  { value: 'voluntary', label: 'Voluntary (resignation)' },
  { value: 'involuntary', label: 'Involuntary (termination)' },
  { value: 'layoff', label: 'Layoff / position eliminated' },
  { value: 'other', label: 'Other' },
];

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TerminationCard({ employee }: { employee: Employee }) {
  const router = useRouter();
  const terminated = !!employee.terminated_at;

  const [lastDay, setLastDay] = useState(localToday());
  const [type, setType] = useState('involuntary');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [rehire, setRehire] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onTerminate() {
    if (!reason.trim()) return toast.error('Enter a reason');
    if (!window.confirm(`Separate ${employee.name}? This deactivates their account.`)) return;
    setBusy(true);
    const res = await terminateEmployee({
      id: employee.id,
      lastDayWorked: lastDay,
      terminationType: type,
      reason,
      details,
      rehireEligible: rehire,
    });
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success('Separation recorded');
    router.refresh();
  }

  async function onReactivate() {
    if (!window.confirm(`Reactivate ${employee.name} and clear the separation record?`)) return;
    setBusy(true);
    const res = await reactivateEmployee(employee.id);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success('Employee reactivated');
    router.refresh();
  }

  if (terminated) {
    return (
      <Card className="max-w-2xl border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5 text-destructive" /> Separated
          </CardTitle>
          <CardDescription>This crew member has been separated and deactivated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Last day worked</dt>
            <dd>{employee.last_day_worked ? format(new Date(`${employee.last_day_worked}T12:00:00`), 'MMM d, yyyy') : '—'}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="capitalize">{employee.termination_type ?? '—'}</dd>
            <dt className="text-muted-foreground">Reason</dt>
            <dd>{employee.termination_reason ?? '—'}</dd>
            {employee.termination_details && (
              <>
                <dt className="text-muted-foreground">Details</dt>
                <dd>{employee.termination_details}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Rehire eligible</dt>
            <dd>
              <Badge variant={employee.rehire_eligible ? 'default' : 'secondary'}>
                {employee.rehire_eligible ? 'Yes' : 'No'}
              </Badge>
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={`/admin/employees/${employee.id}/separation`} target="_blank">
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-1.5" /> View / print Letter of Separation
              </Button>
            </Link>
            <Button variant="ghost" onClick={onReactivate} disabled={busy}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Reactivate
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserMinus className="h-5 w-5" /> Separation
        </CardTitle>
        <CardDescription>
          Record a separation and generate a Letter of Separation. This deactivates the account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="lastday">Last day worked</Label>
            <Input id="lastday" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Attendance policy — repeated no-shows"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="details">Details (optional, internal)</Label>
            <Input
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Any supporting notes"
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={rehire}
              onChange={(e) => setRehire(e.target.checked)}
            />
            Eligible for rehire
          </label>
        </div>
        <Button variant="destructive" onClick={onTerminate} disabled={busy}>
          {busy ? 'Saving…' : 'Terminate & generate letter'}
        </Button>
      </CardContent>
    </Card>
  );
}
