import { getWarehouseStock, getTruckStock, type StockRow } from '@/lib/materials/inventory';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

function StockTable({ title, description, rows }: { title: string; description: string; rows: StockRow[] }) {
  const lowCount = rows.filter((r) => r.low).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {lowCount > 0 && <Badge variant="destructive">{lowCount} low</Badge>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stock recorded yet — use Receive to add inventory.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reorder at</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.location}-${r.material}`} className={r.low ? 'bg-destructive/5' : ''}>
                    <TableCell>{r.location}</TableCell>
                    <TableCell className="font-medium">{r.material}</TableCell>
                    <TableCell className="text-right">{r.onHand}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.reorder ?? '—'}</TableCell>
                    <TableCell>
                      {r.low && <Badge variant="destructive">Low</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ReportingPage() {
  const [warehouse, truck] = await Promise.all([getWarehouseStock(), getTruckStock()]);
  return (
    <div className="space-y-6">
      <StockTable
        title="Warehouse stock"
        description="On-hand by warehouse. Rows at or below the reorder point are flagged."
        rows={warehouse}
      />
      <StockTable
        title="Truck stock"
        description="On-hand loaded on each truck."
        rows={truck}
      />
    </div>
  );
}
