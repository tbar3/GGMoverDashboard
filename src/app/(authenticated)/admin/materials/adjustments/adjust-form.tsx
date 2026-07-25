'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { SlidersHorizontal } from 'lucide-react';
import { adjustStock } from '@/lib/materials/inventory-actions';

interface Opt {
  id: number;
  name: string;
}

export function AdjustForm({
  materials,
  warehouses,
  trucks,
}: {
  materials: Opt[];
  warehouses: Opt[];
  trucks: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [materialId, setMaterialId] = useState('');
  const [locType, setLocType] = useState<'warehouse' | 'truck'>('warehouse');
  const [locId, setLocId] = useState('');
  const [qtyDelta, setQtyDelta] = useState('');
  const [reason, setReason] = useState('');

  const locOptions = locType === 'warehouse' ? warehouses : trucks;

  function submit() {
    if (!materialId) return toast.error('Pick a material');
    if (!locId) return toast.error('Pick a location');
    if (!reason.trim()) return toast.error('A reason is required');
    start(async () => {
      const res = await adjustStock({ materialId, location: locType, locationId: locId, qtyDelta, reason });
      if (res.ok) {
        toast.success('Adjustment recorded');
        setMaterialId('');
        setQtyDelta('');
        setReason('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not adjust');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" /> Adjust stock
        </CardTitle>
        <CardDescription>
          Correct on-hand counts up or down (use a negative number to remove). A reason is required and
          everything is logged to History.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location type</Label>
            <Select
              value={locType}
              onValueChange={(v) => {
                setLocType(v as 'warehouse' | 'truck');
                setLocId('');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="truck">Truck</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{locType === 'warehouse' ? 'Warehouse' : 'Truck'}</Label>
            <Select value={locId} onValueChange={setLocId}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {locOptions.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (+ / −)</Label>
            <Input value={qtyDelta} onChange={(e) => setQtyDelta(e.target.value)} placeholder="e.g. -3" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 flex-1 min-w-[16rem]">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged, miscount" />
          </div>
          <Button onClick={submit} disabled={pending}>
            Record adjustment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
