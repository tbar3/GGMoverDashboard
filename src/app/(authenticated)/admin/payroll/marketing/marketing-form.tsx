'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { saveMarketingHours } from '../run/actions';

interface Row {
  id: string;
  name: string;
  hours: number | null;
  token: string;
}

export function MarketingForm({ weekStart, employees }: { weekStart: string; employees: Row[] }) {
  const router = useRouter();
  const [date, setDate] = useState(weekStart);

  function goToWeek(d: string) {
    setDate(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) router.push(`/admin/payroll/marketing?week=${d}`);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 max-w-xs">
        <Label htmlFor="week">Week (any day in it)</Label>
        <Input id="week" type="date" value={date} onChange={(e) => goToWeek(e.target.value)} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead className="text-right">Marketing Hours</TableHead>
            <TableHead className="text-right">Personal link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((e) => (
            <MarketingRow key={e.id} weekStart={weekStart} row={e} onSaved={() => router.refresh()} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MarketingRow({
  weekStart,
  row,
  onSaved,
}: {
  weekStart: string;
  row: Row;
  onSaved: () => void;
}) {
  const [text, setText] = useState(row.hours == null ? '' : String(row.hours));
  const [busy, setBusy] = useState(false);

  async function commit() {
    const trimmed = text.trim();
    const hours = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(hours) || hours < 0) {
      setText(row.hours == null ? '' : String(row.hours));
      return;
    }
    if ((row.hours ?? 0) === hours) return;
    setBusy(true);
    try {
      const res = await saveMarketingHours(row.id, weekStart, hours);
      if (!res.ok) toast.error(res.error || 'Save failed');
      else {
        toast.success(`${row.name}: ${hours} h`);
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-right">
        <Input
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className="h-8 w-24 text-right ml-auto"
        />
      </TableCell>
      <TableCell className="text-right">
        <CopyLinkButton token={row.token} name={row.name} />
      </TableCell>
    </TableRow>
  );
}

function CopyLinkButton({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/marketing/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(`Copied ${name}'s marketing link`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — show the URL so it can be copied manually.
      toast.message(url);
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-8" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      Copy link
    </Button>
  );
}
