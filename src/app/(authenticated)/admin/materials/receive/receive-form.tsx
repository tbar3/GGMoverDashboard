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
import { PackagePlus } from 'lucide-react';
import { receiveStock } from '@/lib/materials/inventory-actions';

interface Opt {
  id: number;
  name: string;
}

export function ReceiveForm({ materials, warehouses }: { materials: Opt[]; warehouses: Opt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [materialId, setMaterialId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses.length === 1 ? String(warehouses[0].id) : '');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  function submit() {
    if (!materialId) return toast.error('Pick a material');
    if (!warehouseId) return toast.error('Pick a warehouse');
    start(async () => {
      const res = await receiveStock({ materialId, warehouseId, qty, note });
      if (res.ok) {
        toast.success('Stock received');
        setMaterialId('');
        setQty('');
        setNote('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not receive');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5" /> Receive stock
        </CardTitle>
        <CardDescription>Add incoming inventory to a warehouse. Logged to History.</CardDescription>
      </CardHeader>
      <CardContent>
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
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" />
          </div>
          <Button onClick={submit} disabled={pending}>
            Receive
          </Button>
        </div>
        <div className="mt-3 space-y-1.5 max-w-md">
          <Label>Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO #, supplier, etc." />
        </div>
      </CardContent>
    </Card>
  );
}
