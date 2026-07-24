'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateMyRate } from '@/lib/crew-actions';

export function ProfileForm({ initialRate }: { initialRate: number | null }) {
  const router = useRouter();
  const [rate, setRate] = useState(initialRate != null ? String(initialRate) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('hourly_rate', rate);
    const res = await updateMyRate(fd);
    setSaving(false);
    setMsg(res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error ?? 'Something went wrong.' });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Pay Rate</CardTitle>
        <CardDescription>
          Used to estimate your weekly pay on your dashboard. This is your own estimate — it
          doesn&apos;t change your actual payroll.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="rate">Hourly rate ($/hr)</Label>
          <Input
            id="rate"
            inputMode="decimal"
            placeholder="e.g. 18.00"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-green-600' : 'text-destructive'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
