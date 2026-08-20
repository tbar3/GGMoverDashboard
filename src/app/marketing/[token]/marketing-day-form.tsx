'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Day {
  date: string;
  label: string;
  hours: number | null;
}

export function MarketingDayForm({
  token,
  employeeName,
  weekLabel,
  prevWeek,
  nextWeek,
  days,
}: {
  token: string;
  employeeName: string;
  weekLabel: string;
  prevWeek: string;
  nextWeek: string;
  days: Day[];
}) {
  const [total, setTotal] = useState(days.reduce((s, d) => s + (d.hours ?? 0), 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketing Hours</CardTitle>
        <CardDescription>
          Hi {employeeName} — enter the marketing hours you worked each day. Each day saves on its
          own; you can come back anytime.
        </CardDescription>
        <div className="flex items-center justify-between pt-2">
          <a
            href={`?week=${prevWeek}`}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </a>
          <span className="font-semibold text-sm">{weekLabel}</span>
          <a
            href={`?week=${nextWeek}`}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-muted"
          >
            Next <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {days.map((d) => (
          <DayRow key={d.date} token={token} day={d} onDelta={(delta) => setTotal((t) => t + delta)} />
        ))}
        <div className="flex items-center justify-between border-t pt-3 font-semibold">
          <span>Week total</span>
          <span>{total.toFixed(2)} hrs</span>
        </div>
        <p className="text-xs text-muted-foreground">
          These hours go straight to payroll for this week. Double-check before your pay period ends.
        </p>
      </CardContent>
    </Card>
  );
}

function DayRow({
  token,
  day,
  onDelta,
}: {
  token: string;
  day: Day;
  onDelta: (delta: number) => void;
}) {
  const [text, setText] = useState(day.hours == null ? '' : String(day.hours));
  const [saved, setSaved] = useState(day.hours ?? 0);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function commit() {
    const trimmed = text.trim();
    const hours = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      toast.error('Enter hours between 0 and 24');
      setText(saved === 0 ? '' : String(saved));
      return;
    }
    if (hours === saved) return;
    setBusy(true);
    setOk(false);
    try {
      const res = await fetch(`/api/marketing/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: day.date, hours }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Could not save');
        return;
      }
      onDelta(hours - saved);
      setSaved(hours);
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    } catch {
      toast.error('Could not save — check your connection');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm">{day.label}</label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.25"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="0"
          className="w-24 text-right"
        />
        <span className="w-4">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : ok ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : null}
        </span>
      </div>
    </div>
  );
}
